"""Blackwater Terminal: merges the members' AH scans and rebuilds the tool page with live data.

Loop (every INTERVAL_SECONDS):
1. New uploads (gold_radar_uploads, status 'pending'): download the SavedVariables file from the private bucket
   (AuctionDB, Auctionator, aux or Tradeskills; tool/ah/scanfiles.py), parse it (data only, nothing is executed), keep the auction house's
   faction and store every price point once in Supabase (gold_radar_scans / gold_radar_history) and in a local
   SQLite copy.
2. Uploads marked 'revoke' by the owner: delete the points they contributed, rebuild the local copy.
3. TSM public data (GOLD_RADAR_TSM, e.g. "pvp-eu-horde=forever/eu/realm/<realm>"): every TSM_HOURS fetched into
   the local copy (prices + sold per day); nothing is stored in Supabase, it can always be fetched again. Without
   GOLD_RADAR_TSM the worker checks once a day whether TSM offers WoW Forever data (tool/ah/tsm.py CANDIDATES) and
   then uses it for the first auction house; status/tsm.json in the bucket tells the admin page.
4. (The page's demo with Classic data is gone since 10.11.2026; the uploaded model page carries no demo either.)
5. Blizzard Game Data API (BLIZZARD_CLIENT_ID/SECRET): every auction of the auction house, about hourly.
   Every ruleset like pvp-eu-horde reads its WoW Forever auction house by itself (forever:eu:pvp:Horde, all realms
   of that ruleset; GOLD_RADAR_BLIZZARD="<ruleset>=ns:region:realm[:faction]" overrides) and feeds the live page (lowest unit buyout + quantity per
   item, so trends and sell-through come from Blizzard's own hourly dumps). Snapshots live only on the
   server (blizzard-*.db, last BLIZZARD_KEEP_DAYS days), not in Supabase; status/blizzard.json tells the admin page.
6. Recorded full scans in uploaded AuctionDB files (every single auction, tool/ah/rawscan.py): kept on the server
   only (raw-<ruleset>.db, not in Supabase; single auctions 4 days, depth 30 days), consecutive scans of any
   members within 12 hours measure what was bought per day and at which prices. A withdrawn upload takes its scans
   (and what was measured from them) along, unless another upload brought the same scan.
7. For every auction house that changed (new points, new model page): take <ruleset>/model.html (the page from
   ah/dashboard.py --teilen), compute the live part with the tool's own analysis (tool/ah) and write
   <ruleset>/dashboard.html, which /gold-radar serves.
8. Player census (tool/ah/census.py): every 6 hours the level counts of both factions of every ruleset from
   classicarmory.gg (nightly snapshots) and forever.raider.io (daily) into DATA_DIR/census.json (history kept); the
   pages show them in the tab "Spieler" next to the model's level curve.

Only the Python standard library; the tool code in tool/ comes from WowForever-Gold (tools/export_worker.py).
Environment: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, GOLD_RADAR_RULESETS
(default pvp-eu-horde), DATA_DIR (default /data), INTERVAL_SECONDS (default 60).
"""
import gzip, json, logging, os, sqlite3, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'tool', 'ah'))
import census, dashboard, rawscan, scanfiles, tsm  # noqa: E402  (tool code from WowForever-Gold)
import blizzard  # noqa: E402
from snapshot import SCHEMA  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('gold-radar-worker')

URL = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
RULESETS = [r.strip() for r in os.environ.get('GOLD_RADAR_RULESETS', os.environ.get('GOLD_RADAR_RULESET', 'pvp-eu-horde')).split(',') if r.strip()]
DATA_DIR = os.environ.get('DATA_DIR', '/data')
CENSUS_PATH = os.path.join(DATA_DIR, 'census.json')
INTERVAL = int(os.environ.get('INTERVAL_SECONDS', '60'))
BUCKET = 'gold-radar'
TSM = dict(x.split('=', 1) for x in os.environ.get('GOLD_RADAR_TSM', '').split(',') if '=' in x)
TSM_HOURS = float(os.environ.get('TSM_HOURS', '6'))
BLIZZ = blizzard.Client(os.environ['BLIZZARD_CLIENT_ID'], os.environ['BLIZZARD_CLIENT_SECRET']) \
    if os.environ.get('BLIZZARD_CLIENT_ID') and os.environ.get('BLIZZARD_CLIENT_SECRET') else None
BLIZZ_TARGETS = {r: blizzard.ruleset_target(r) for r in RULESETS if blizzard.ruleset_target(r)}  # one per ruleset
BLIZZ_TARGETS.update(x.strip().split('=', 1) for x in os.environ.get('GOLD_RADAR_BLIZZARD', '').split(',') if '=' in x)
BLIZZ_MINUTES = float(os.environ.get('BLIZZARD_MINUTES', '60'))
BLIZZ_KEEP_DAYS = float(os.environ.get('BLIZZARD_KEEP_DAYS', '10'))
BLIZZ_STATUS = {}  # per ruleset: last result of the hourly Blizzard import (also read when pages are built)
BATCH = 500
CFG = json.load(open(os.path.join(HERE, 'tool', 'ah', 'config.json'), encoding='utf-8'))


# ---------- Supabase (REST + Storage) ----------
def request(method, path, body=None, headers=None, raw=False):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
    h.update(headers or {})
    data = None
    if body is not None:
        if isinstance(body, (bytes, bytearray)):
            data = bytes(body)
        else:
            data = json.dumps(body).encode()
            h.setdefault('Content-Type', 'application/json')
    req = urllib.request.Request(URL + path, data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=120) as res:
        out = res.read()
    if raw:
        return out
    return json.loads(out) if out else None


def rest(method, table, query='', body=None, prefer=None):
    return request(method, f'/rest/v1/{table}{"?" + query if query else ""}', body,
                   {'Prefer': prefer} if prefer else None)


def storage_get(path):
    try:
        return request('GET', f'/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}', raw=True)
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return None
        raise


def storage_put(path, data, content_type):
    request('POST', f'/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}', data,
            {'Content-Type': content_type, 'x-upsert': 'true'}, raw=True)


def storage_updated(folder, name):
    rows = request('POST', f'/storage/v1/object/list/{BUCKET}', {'prefix': folder, 'search': name, 'limit': 10}) or []
    return next((r.get('updated_at') for r in rows if r.get('name') == name), None)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- local copy (the tool's own SQLite schema; realm column = ruleset) ----------
def local(ruleset, suffix=''):
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(os.path.join(DATA_DIR, f'{ruleset}.db{suffix}'))
    con.executescript(SCHEMA)
    if not suffix:  # the measured sales (raw-<ruleset>.db) for the analysis; its tables are not in the main schema
        raw_db(ruleset).close()
        con.execute('ATTACH DATABASE ? AS raw', (os.path.join(DATA_DIR, f'raw-{ruleset}.db'),))
    return con


def raw_db(ruleset):
    """Recorded full scans of the members' AuctionDB files: survives a resync, as it is not in Supabase."""
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(os.path.join(DATA_DIR, f'raw-{ruleset}.db'))
    con.executescript(rawscan.SCHEMA)
    con.execute('CREATE TABLE IF NOT EXISTS raw_owner (realm TEXT, ts INTEGER, upload_id TEXT, PRIMARY KEY (realm, ts, upload_id))')
    return con


def put_local(con, ruleset, scans, history):
    con.executemany('INSERT OR IGNORE INTO scans VALUES (?,?,?,?,?,?,?,?,?)',
                    [(ruleset, s['item_id'], s['seen'], s['market'], s['min_price'], None, s['quantity'], s['scans'],
                      int(time.time())) for s in scans])
    con.executemany('INSERT OR IGNORE INTO history VALUES (?,?,?,?,?)',
                    [(ruleset, h['item_id'], h['t'], h['market'], h['quantity']) for h in history])
    con.commit()


def resync(ruleset):
    """Rebuilds the local copy from Supabase (after a revoke, or when the copy is missing). Built next to the old
    copy and swapped in only when complete, so a failed attempt never leaves a half-filled copy behind."""
    path = os.path.join(DATA_DIR, f'{ruleset}.db')
    if os.path.exists(path + '.new'):
        os.remove(path + '.new')
    con = local(ruleset, '.new')
    for table, cols in (('gold_radar_scans', 'item_id,seen,market,min_price,quantity,scans'),
                        ('gold_radar_history', 'item_id,t,market,quantity')):
        offset = 0
        while True:
            rows = rest('GET', table, f'select={cols}&ruleset=eq.{ruleset}&order=item_id,{cols.split(",")[1]}'
                                      f'&limit=1000&offset={offset}') or []
            if table == 'gold_radar_scans':
                put_local(con, ruleset, rows, [])
            else:
                put_local(con, ruleset, [], rows)
            if len(rows) < 1000:
                break
            offset += 1000
    arch = os.path.join(DATA_DIR, f'blizzard-{ruleset}.db')
    if os.path.exists(arch):  # Blizzard snapshots are not in Supabase: take them over from their own file
        con.execute('ATTACH DATABASE ? AS arch', (arch,))
        con.execute('INSERT OR IGNORE INTO scans SELECT * FROM arch.scans')
        con.commit()
        con.execute('DETACH DATABASE arch')
    n = con.execute('SELECT COUNT(*) FROM scans').fetchone()[0]
    con.close()
    os.replace(path + '.new', path)
    log.info('%s: lokale Kopie neu aufgebaut (%d Messpunkte)', ruleset, n)
    return local(ruleset)


# ---------- Blizzard snapshots (kept on the server only) ----------
def blizz_db(name):
    con = sqlite3.connect(os.path.join(DATA_DIR, f'blizzard-{name}.db'))
    con.executescript(SCHEMA)
    return con


def blizz_put(cons, label, ts, snap):
    """One snapshot into the given databases: lowest unit buyout as price (same kind as every other source), quantity."""
    rows = [(label, item, ts, low, low, None, qty, None, int(time.time())) for item, (low, _median, qty) in snap.items()]
    cutoff = int(time.time() - BLIZZ_KEEP_DAYS * 86400)
    for con in cons:
        con.executemany('INSERT OR IGNORE INTO scans VALUES (?,?,?,?,?,?,?,?,?)', rows)
        con.execute('DELETE FROM scans WHERE seen < ?', (cutoff,))  # a working set: hourly points of the last days
        con.execute('DELETE FROM history WHERE t < ?', (cutoff,))
        con.commit()


# ---------- uploads ----------
def faction_of(ruleset):
    return 'Horde' if ruleset.endswith('-horde') else 'Alliance' if ruleset.endswith('-alliance') else None


def parse(raw, ruleset, upload_id):
    """Prices of this auction house from an AuctionDB, Auctionator or Tradeskills file -> (scans, history, sources)."""
    p = scanfiles.read(raw, faction_of(ruleset))
    scans = [dict(ruleset=ruleset, item_id=i, seen=t, realm=r, market=m, min_price=lo, quantity=q, scans=n,
                  upload_id=upload_id) for r, i, t, m, lo, q, n in p.scans.values()]
    history = [dict(ruleset=ruleset, item_id=i, t=t, realm=r, market=m, quantity=q, upload_id=upload_id)
               for r, i, t, m, q in p.history.values()]
    # points from the future (wrong PC clock or an edited file) would sit at the end of every price line: drop them
    cutoff = time.time() + 2 * 3600
    late = sum(1 for x in scans if x['seen'] > cutoff) + sum(1 for x in history if x['t'] > cutoff)
    if late:
        scans = [x for x in scans if x['seen'] <= cutoff]
        history = [x for x in history if x['t'] <= cutoff]
        log.warning('Upload %s: %d Messpunkte mit Zeit in der Zukunft verworfen', upload_id, late)
        if not scans and not history:
            raise ValueError('alle Zeitstempel liegen in der Zukunft (Uhr des PCs falsch gestellt?)')
    return scans, history, p.sources


def fix_guild_prices(cons):
    """One-time repair (10.11.2026): Tradeskills guild prices were read with their market value as the lowest price
    (tool/ah/scanfiles.py, now fixed). Re-reads every processed Tradeskills upload and overwrites its points in Supabase
    and in the local copies. Newest upload first, so a point that several uploads carry ends up with the oldest one,
    as before (ignore-duplicates kept the first)."""
    ups = rest('GET', 'gold_radar_uploads', 'status=eq.done&select=id,ruleset,file_path,created_at&order=created_at.desc&limit=2000') or []
    files = points = 0
    for u in ups:
        if u['ruleset'] not in cons:
            continue
        raw = storage_get(u['file_path'])
        if raw is None:
            continue
        if raw[:2] == b'\x1f\x8b':
            raw = gzip.decompress(raw)
        if b'BlackthornesTSDB' not in raw[:300]:
            continue
        try:
            scans, _, _ = parse(raw, u['ruleset'], u['id'])
        except ValueError:
            continue
        guild = [s for s in scans if s['quantity'] is None]
        for i in range(0, len(guild), BATCH):
            rest('POST', 'gold_radar_scans', 'on_conflict=ruleset,item_id,seen', guild[i:i + BATCH],
                 prefer='resolution=merge-duplicates,return=minimal')
        con = cons[u['ruleset']]
        con.executemany('UPDATE scans SET market=?, min=? WHERE realm=? AND item_id=? AND seen=? AND quantity IS NULL',
                        [(s['market'], s['min_price'], s['ruleset'], s['item_id'], s['seen']) for s in guild])
        con.commit()
        files += 1
        points += len(guild)
    return files, points


def store(table, rows, conflict):
    for i in range(0, len(rows), BATCH):
        rest('POST', table, f'on_conflict={conflict}', rows[i:i + BATCH],
             prefer='resolution=ignore-duplicates,return=minimal')


def process(u, con, rawcon=None):
    raw = storage_get(u['file_path'])
    if raw is None:
        raise ValueError('Datei nicht im Speicher gefunden')
    if raw[:2] == b'\x1f\x8b':   # the upload form packs the file (gzip) before sending it
        raw = gzip.decompress(raw)
    scans, history, realms = parse(raw, u['ruleset'], u['id'])
    store('gold_radar_scans', scans, 'ruleset,item_id,seen')
    store('gold_radar_history', history, 'ruleset,item_id,t')
    put_local(con, u['ruleset'], scans, history)
    full = raw_put(rawcon, u, raw) if rawcon is not None else ''
    rest('PATCH', 'gold_radar_uploads', f'id=eq.{u["id"]}',
         {'status': 'done', 'items': len(scans), 'realms': realms + ([full] if full else []), 'message': None,
          'processed_at': now_iso()}, prefer='return=minimal')
    log.info('Upload %s (%s): %d Preise, %d Verlaufspunkte, Quellen %s', u['id'], u.get('display_name'),
             len(scans), len(history), ', '.join(realms + ([full] if full else [])))


def raw_put(rawcon, u, raw):
    """The single auctions of an AuctionDB file's recorded full scans (option "Record full scans"), if any; a broken
    or odd part never fails the upload, its prices are in already. Returns a note for the upload's sources."""
    if not raw.lstrip()[:40].startswith(b'AuctionDB') or b'["dataFormatVersion"]' not in raw:
        return ''
    try:
        added, pairs, stamps = rawscan.ingest(rawcon, raw, u['ruleset'], faction_of(u['ruleset']))
        rawcon.executemany('INSERT OR IGNORE INTO raw_owner VALUES (?,?,?)', [(u['ruleset'], t, u['id']) for t in stamps])
        rawcon.commit()
    except Exception as e:
        log.warning('Upload %s: Rohscans nicht gelesen: %s', u['id'], e)
        return ''
    log.info('Upload %s: %d Rohscans (%d neu), %d Scan-Paare mit Verkäufen gemessen', u['id'], len(stamps), added, pairs)
    return f'AuctionDB-Rohscans ({len(stamps)} Scans, einzelne Auktionen)' if stamps else ''


def raw_revoke(rawcon, u):
    """Removes the full scans only this upload brought, with the sales measured from them."""
    stamps = [t for t, in rawcon.execute('SELECT ts FROM raw_owner WHERE realm=? AND upload_id=?', (u['ruleset'], u['id']))]
    rawcon.execute('DELETE FROM raw_owner WHERE upload_id=?', (u['id'],))
    orphans = [t for t in stamps if not rawcon.execute('SELECT 1 FROM raw_owner WHERE realm=? AND ts=?', (u['ruleset'], t)).fetchone()]
    rawscan.drop_scans(rawcon, u['ruleset'], orphans)
    rawcon.commit()
    if orphans:
        log.info('Upload %s: %d Rohscans entfernt', u['id'], len(orphans))


def revoke(u):
    for table in ('gold_radar_scans', 'gold_radar_history'):
        rest('DELETE', table, f'upload_id=eq.{u["id"]}', prefer='return=minimal')
    rest('PATCH', 'gold_radar_uploads', f'id=eq.{u["id"]}', {'status': 'revoked', 'processed_at': now_iso()},
         prefer='return=minimal')
    log.info('Upload %s zurückgenommen', u['id'])


# ---------- page ----------
def build(ruleset, con):
    model = storage_get(f'{ruleset}/model.html')
    if model is None:
        log.warning('%s: noch keine Vorlage (model.html) – im Admin-Bereich dashboard-teilen.html hochladen', ruleset)
        return
    html = model.decode('utf-8')
    start, end = '/*__DATA_START__*/', '/*__DATA_END__*/'
    if start not in html or end not in html:
        log.warning('%s: Vorlage ist zu alt (ohne DATA-Marker) – neu erzeugen und hochladen', ruleset)
        return
    head, rest_ = html.split(start, 1)
    body, tail = rest_.split(end, 1)
    data = json.loads(body)
    if 'ctx' not in data:
        log.warning('%s: Vorlage ohne ctx – neu erzeugen und hochladen', ruleset)
        return
    live = dashboard.live_payload(con, ruleset, CFG, data['ctx'])
    bz = BLIZZ_STATUS.get(ruleset)
    if live and bz and bz.get('ok'):  # the page tells where the numbers come from
        live.setdefault('sources', []).insert(0, dict(
            id='blizzard', name='Blizzard-API (ganzes AH)', t=int(datetime.fromisoformat(bz['dump']).timestamp()),
            items=bz.get('items'), auctions=bz.get('auctions'),
            note='Alle Auktionen des Auktionshauses, stündlich: Tiefstpreis und Menge je Item.'))
    data['demo'] = None   # no demo any more (an older uploaded model page may still carry one)
    if live:
        live['realm'] = f'{ruleset} (Gilden-Scans)'
    data['live'] = live
    try:   # player census of this auction house (both factions), fetched in the main loop
        cuts = census.cuts_for([ruleset])
        cache = json.load(open(CENSUS_PATH, encoding='utf-8')) if os.path.exists(CENSUS_PATH) else {}
        if cuts and cache:
            data['census'] = census.payload(cache, cuts)
    except Exception as e:
        log.warning('%s: Census nicht eingebaut: %s', ruleset, e)
    page = head + start + json.dumps(data, ensure_ascii=False) + end + tail
    storage_put(f'{ruleset}/dashboard.html', page.encode('utf-8'), 'text/html; charset=utf-8')
    log.info('%s: Seite neu gebaut (%s)', ruleset, f'Stand {live["at"]}, {live["n_scans"]} Scan-Zeitpunkte' if live else 'ohne Scans')


def main():
    if not URL or not KEY:
        raise SystemExit('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY fehlen')
    state_path = os.path.join(DATA_DIR, 'state.json')
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        state = json.load(open(state_path, encoding='utf-8'))
    except (OSError, ValueError):
        state = {}
    cons = {}
    raws = {r: raw_db(r) for r in RULESETS}
    while True:  # without the tables nothing works: wait for the schema instead of crashing in a loop
        try:
            for r in RULESETS:
                if r not in cons:
                    cons[r] = local(r) if os.path.exists(os.path.join(DATA_DIR, f'{r}.db')) else resync(r)
            break
        except urllib.error.HTTPError as e:
            log.error('Supabase antwortet %s – ist supabase/schema.sql eingespielt? Neuer Versuch in %d s', e.code, INTERVAL)
            time.sleep(INTERVAL)
    log.info('läuft für %s, alle %d s', ', '.join(RULESETS), INTERVAL)
    if not state.get('_guild_min_v1'):   # one-time repair of the guild prices (see fix_guild_prices)
        try:
            files, points = fix_guild_prices(cons)
            log.info('Gildenpreise korrigiert: %d Tradeskills-Uploads, %d Punkte', files, points)
            state['_guild_min_v1'] = now_iso()
            json.dump(state, open(state_path, 'w', encoding='utf-8'))
            for r in RULESETS:
                build(r, cons[r])
        except Exception:
            log.exception('Korrektur der Gildenpreise fehlgeschlagen, nächster Versuch beim nächsten Start')
    if not state.get('_adb_house_v1'):   # one-time: AuctionDB files whose houses are keyed "realm Faction" failed before
        try:   # tool/ah/scanfiles.py reads them since 10.11.2026; their uploads go back into the queue
            failed = rest('GET', 'gold_radar_uploads', 'status=eq.error&message=like.keine%20Preise%20f*&select=id&limit=500') or []
            for u in failed:
                rest('PATCH', 'gold_radar_uploads', f'id=eq.{u["id"]}', {'status': 'pending', 'message': None}, prefer='return=minimal')
            log.info('AuctionDB-Uploads mit „keine Preise für …“ erneut eingereiht: %d', len(failed))
            state['_adb_house_v1'] = now_iso()
            json.dump(state, open(state_path, 'w', encoding='utf-8'))
        except Exception:
            log.exception('Erneutes Einreihen fehlgeschlagen, nächster Versuch beim nächsten Start')
    tsm_next = {r: 0.0 for r in TSM if r in RULESETS}
    probe_next = 0.0
    census_next = 0.0
    blizz_next, blizz_cid, blizz_last, blizz_status = {}, {}, {}, BLIZZ_STATUS
    arch = {r: blizz_db(r) for r in BLIZZ_TARGETS if r in RULESETS}
    while True:
        dirty = set()
        try:
            for u in rest('GET', 'gold_radar_uploads', 'status=eq.pending&order=created_at.asc&limit=20') or []:
                if u['ruleset'] not in RULESETS:
                    continue
                try:
                    process(u, cons[u['ruleset']], raws[u['ruleset']])
                    dirty.add(u['ruleset'])
                except Exception as e:  # a broken file must not stop the others
                    log.warning('Upload %s fehlgeschlagen: %s', u['id'], e)
                    rest('PATCH', 'gold_radar_uploads', f'id=eq.{u["id"]}',
                         {'status': 'error', 'message': str(e)[:200], 'processed_at': now_iso()}, prefer='return=minimal')
            revoked = set()
            for u in rest('GET', 'gold_radar_uploads', 'status=eq.revoke&limit=50') or []:
                if u['ruleset'] in raws:
                    raw_revoke(raws[u['ruleset']], u)
                revoke(u)
                revoked.add(u['ruleset'])
            for r in revoked & set(RULESETS):
                cons[r].close()
                cons[r] = resync(r)
                dirty.add(r)
            if not TSM and time.time() >= probe_next:  # look for WoW Forever data at TSM once a day
                probe_next = time.time() + 86400
                found = tsm.find_forever()
                status = {'checked': now_iso(), 'found': found, 'ruleset': RULESETS[0] if found else None,
                          'candidates': tsm.CANDIDATES}
                storage_put('status/tsm.json', json.dumps(status).encode(), 'application/json')
                if found:
                    log.warning('TSM bietet jetzt WoW-Forever-Daten an: %s – wird für %s genutzt', found, RULESETS[0])
                    TSM[RULESETS[0]] = found
                    tsm_next[RULESETS[0]] = 0.0
                else:
                    log.info('TSM: noch keine WoW-Forever-Daten, nächste Prüfung in 24 Std.')
            if BLIZZ:  # Blizzard: whole auction house about hourly
                jobs = [(r, t) for r, t in BLIZZ_TARGETS.items() if r in RULESETS]
                changed = False
                if time.time() >= blizz_next.get('_realms', 0):  # Forever realm names for the admin page (which realms exist yet)
                    blizz_next['_realms'] = time.time() + 86400
                    try:
                        blizz_status['_forever_realms'] = {'eu': blizzard.realm_names(BLIZZ, 'eu', 'forever')}
                        changed = True
                    except Exception as e:
                        log.info('Blizzard: Forever-Realmliste nicht abrufbar: %s', e)
                for key, target in jobs:
                    if time.time() < blizz_next.get(key, 0):
                        continue
                    blizz_next[key] = time.time() + BLIZZ_MINUTES * 60
                    st = blizz_status.setdefault(key, {})
                    st['target'] = target
                    st['checked'] = now_iso()
                    try:
                        t = blizzard.parse_target(target)
                        if key not in blizz_cid:
                            blizz_cid[key], st['realms_used'] = blizzard.connected_realms(BLIZZ, t['region'], t['ns'], t['realm'])
                        ts, snap, n = blizzard.snapshot(BLIZZ, target, blizz_cid[key])
                        st.update(ok=True, error=None, auctions=n, items=len(snap),
                                  dump=datetime.fromtimestamp(ts, timezone.utc).isoformat())
                        if ts != blizz_last.get(key):
                            blizz_last[key] = ts
                            blizz_put([cons[key], arch[key]], key, ts, snap)
                            dirty.add(key)
                            log.info('Blizzard %s: %d Auktionen, %d Items (Stand %s)', target, n, len(snap), st['dump'])
                    except Exception as e:  # not published yet, realm unknown, API down: report, try again later
                        st.update(ok=False, error=str(e)[:200])
                        if isinstance(e, LookupError) and 'nicht gefunden' in str(e):
                            st['realms'] = blizzard.realm_names(BLIZZ, t['region'], t['ns'])[:80]
                        log.info('Blizzard %s: %s', target, e)
                    changed = True
                if changed:
                    try:
                        realms = blizz_status.get('_forever_realms', {})
                        targets = {k: v for k, v in blizz_status.items() if not k.startswith('_')}
                        storage_put('status/blizzard.json', json.dumps({'checked': now_iso(), 'targets': targets,
                                                                        'forever_realms': realms}).encode(), 'application/json')
                    except Exception as e:
                        log.warning('Blizzard-Status nicht gespeichert: %s', e)
            if time.time() >= census_next:  # player census (classicarmory.gg nightly, raider.io daily): every 6 hours
                census_next = time.time() + 6 * 3600
                try:
                    _, changed = census.update(CENSUS_PATH, census.cuts_for(RULESETS), max_age_h=5, log=log.warning)
                    if changed:
                        log.info('Census: neue Daten')
                        dirty.update(RULESETS)
                except Exception as e:
                    log.warning('Census: Abruf fehlgeschlagen: %s', e)
            for r, when in tsm_next.items():  # TSM public data, every TSM_HOURS (also right after a resync)
                if time.time() < when and r not in revoked:
                    continue
                tsm_next[r] = time.time() + TSM_HOURS * 3600
                try:
                    rows = tsm.fetch(TSM[r])
                except Exception as e:
                    log.warning('TSM %s: Abruf fehlgeschlagen: %s', TSM[r], e)
                    continue
                if rows is None:
                    log.info('TSM: unter %s gibt es (noch) keine Daten', TSM[r])
                else:
                    log.info('TSM %s: %d Items übernommen', r, tsm.store(cons[r], r, rows))
                    dirty.add(r)
            for r in RULESETS:
                updated = storage_updated(r, 'model.html')
                if updated and updated != state.get(r):
                    state[r] = updated
                    dirty.add(r)
            for r in sorted(dirty):
                build(r, cons[r])
            if dirty:
                json.dump(state, open(state_path, 'w', encoding='utf-8'))
        except urllib.error.HTTPError as e:
            log.error('Supabase antwortet %s auf %s – ist supabase/schema.sql eingespielt? Neuer Versuch in %d s',
                      e.code, e.url.split('?')[0].replace(URL, ''), INTERVAL)
        except Exception:
            log.exception('Durchlauf fehlgeschlagen, nächster Versuch in %d s', INTERVAL)
        time.sleep(INTERVAL)


if __name__ == '__main__':
    main()
