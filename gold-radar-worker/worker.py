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
4. Demo: once a day the TSM data behind the page's Demo button (GOLD_RADAR_TSM_DEMO, default classic/eu/region)
   is archived in DATA_DIR/tsm_demo (one file per day: TSM publishes no history), and every page gets its demo built
   from that archive, so the demo's price history grows on the server without anyone running anything locally.
5. For every auction house that changed (new points, new model page): take <ruleset>/model.html (the page from
   ah/dashboard.py --teilen), compute the live part with the tool's own analysis (tool/ah) and write
   <ruleset>/dashboard.html, which /gold-radar serves.

Only the Python standard library; the tool code in tool/ comes from WowForever-Gold (tools/export_worker.py).
Environment: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, GOLD_RADAR_RULESETS
(default pvp-eu-horde), DATA_DIR (default /data), INTERVAL_SECONDS (default 60).
"""
import json, logging, os, sqlite3, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'tool', 'ah'))
import dashboard, scanfiles, tsm  # noqa: E402  (tool code from WowForever-Gold)
from snapshot import SCHEMA  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('gold-radar-worker')

URL = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
RULESETS = [r.strip() for r in os.environ.get('GOLD_RADAR_RULESETS', os.environ.get('GOLD_RADAR_RULESET', 'pvp-eu-horde')).split(',') if r.strip()]
DATA_DIR = os.environ.get('DATA_DIR', '/data')
INTERVAL = int(os.environ.get('INTERVAL_SECONDS', '60'))
BUCKET = 'gold-radar'
TSM = dict(x.split('=', 1) for x in os.environ.get('GOLD_RADAR_TSM', '').split(',') if '=' in x)
TSM_HOURS = float(os.environ.get('TSM_HOURS', '6'))
TSM_DEMO = os.environ.get('GOLD_RADAR_TSM_DEMO', 'classic/eu/region')
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
    n = con.execute('SELECT COUNT(*) FROM scans').fetchone()[0]
    con.close()
    os.replace(path + '.new', path)
    log.info('%s: lokale Kopie neu aufgebaut (%d Messpunkte)', ruleset, n)
    return local(ruleset)


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
    return scans, history, p.sources


def store(table, rows, conflict):
    for i in range(0, len(rows), BATCH):
        rest('POST', table, f'on_conflict={conflict}', rows[i:i + BATCH],
             prefer='resolution=ignore-duplicates,return=minimal')


def process(u, con):
    raw = storage_get(u['file_path'])
    if raw is None:
        raise ValueError('Datei nicht im Speicher gefunden')
    scans, history, realms = parse(raw, u['ruleset'], u['id'])
    store('gold_radar_scans', scans, 'ruleset,item_id,seen')
    store('gold_radar_history', history, 'ruleset,item_id,t')
    put_local(con, u['ruleset'], scans, history)
    rest('PATCH', 'gold_radar_uploads', f'id=eq.{u["id"]}',
         {'status': 'done', 'items': len(scans), 'realms': realms, 'message': None, 'processed_at': now_iso()},
         prefer='return=minimal')
    log.info('Upload %s (%s): %d Preise, %d Verlaufspunkte, Quellen %s', u['id'], u.get('display_name'),
             len(scans), len(history), ', '.join(realms))


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
    if TSM_DEMO:  # demo from the server's own TSM archive (falls back to the demo in the uploaded page)
        try:
            fills = {tier: [tuple(f) for f in v] for tier, v in data['ctx']['fills'].items()}
            demo = dashboard.pack(dashboard.demo_data(dict(CFG, tsm_demo=TSM_DEMO), os.path.join(DATA_DIR, 'tsm_demo')),
                                  CFG, set(data['ctx']['wanted']), fills)
            if demo:
                data['demo'] = demo
        except Exception as e:
            log.warning('Demo aus dem TSM-Archiv nicht gebaut: %s', e)
    if live:
        live['realm'] = f'{ruleset} (Gilden-Scans)'
    data['live'] = live
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
    tsm_next = {r: 0.0 for r in TSM if r in RULESETS}
    probe_next = 0.0
    demo_next = 0.0
    while True:
        dirty = set()
        try:
            for u in rest('GET', 'gold_radar_uploads', 'status=eq.pending&order=created_at.asc&limit=20') or []:
                if u['ruleset'] not in RULESETS:
                    continue
                try:
                    process(u, cons[u['ruleset']])
                    dirty.add(u['ruleset'])
                except Exception as e:  # a broken file must not stop the others
                    log.warning('Upload %s fehlgeschlagen: %s', u['id'], e)
                    rest('PATCH', 'gold_radar_uploads', f'id=eq.{u["id"]}',
                         {'status': 'error', 'message': str(e)[:200], 'processed_at': now_iso()}, prefer='return=minimal')
            revoked = set()
            for u in rest('GET', 'gold_radar_uploads', 'status=eq.revoke&limit=50') or []:
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
            if TSM_DEMO and time.time() >= demo_next:  # demo archive: TSM updates region data once a day
                demo_next = time.time() + 6 * 3600
                try:
                    before = len(os.listdir(os.path.join(DATA_DIR, 'tsm_demo'))) if os.path.isdir(os.path.join(DATA_DIR, 'tsm_demo')) else 0
                    tsm.archive(TSM_DEMO, os.path.join(DATA_DIR, 'tsm_demo'))
                    after = len(os.listdir(os.path.join(DATA_DIR, 'tsm_demo')))
                    if after != before:  # a new day in the archive: rebuild the pages with the longer demo history
                        log.info('Demo-Archiv %s: neuer Tag, %d Dateien', TSM_DEMO, after)
                        dirty.update(RULESETS)
                except Exception as e:
                    log.warning('Demo-Archiv %s: Abruf fehlgeschlagen: %s', TSM_DEMO, e)
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
