"""Blackwater Terminal: merges the members' AH scans and rebuilds the tool page with live data.

Loop (every INTERVAL_SECONDS):
1. New uploads (gold_radar_uploads, status 'pending'): download the SavedVariables file from the private bucket
   (AuctionDB, Auctionator or Tradeskills), parse it (data only, nothing is executed), keep the auction house's
   faction and store every price point once in Supabase (gold_radar_scans / gold_radar_history) and in a local
   SQLite copy.
2. Uploads marked 'revoke' by the owner: delete the points they contributed, rebuild the local copy.
3. For every auction house that changed (new points, new model page): take <ruleset>/model.html (the page from
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
import dashboard, scanfiles  # noqa: E402  (tool code from WowForever-Gold)
from snapshot import SCHEMA  # noqa: E402

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('gold-radar-worker')

URL = (os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
RULESETS = [r.strip() for r in os.environ.get('GOLD_RADAR_RULESETS', os.environ.get('GOLD_RADAR_RULESET', 'pvp-eu-horde')).split(',') if r.strip()]
DATA_DIR = os.environ.get('DATA_DIR', '/data')
INTERVAL = int(os.environ.get('INTERVAL_SECONDS', '60'))
BUCKET = 'gold-radar'
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
