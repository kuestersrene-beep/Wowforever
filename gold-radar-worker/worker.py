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
import dashboard, lua_sv  # noqa: E402  (tool code from WowForever-Gold)
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
def local(ruleset):
    os.makedirs(DATA_DIR, exist_ok=True)
    con = sqlite3.connect(os.path.join(DATA_DIR, f'{ruleset}.db'))
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
    """Rebuilds the local copy from Supabase (after a revoke, or when the copy is missing)."""
    path = os.path.join(DATA_DIR, f'{ruleset}.db')
    if os.path.exists(path):
        os.remove(path)
    con = local(ruleset)
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
    log.info('%s: lokale Kopie neu aufgebaut (%d Messpunkte)', ruleset, n)
    return con


# ---------- uploads ----------
def faction_of(ruleset):
    return 'Horde' if ruleset.endswith('-horde') else 'Alliance' if ruleset.endswith('-alliance') else None


def num(v):
    return int(v) if isinstance(v, (int, float)) else None


class Points:
    """Price points of one upload, each (item, time) once: scans = state per scan, history = older points."""
    def __init__(self, ruleset, upload_id):
        self.ruleset, self.upload_id, self.scans, self.history = ruleset, upload_id, {}, {}

    def scan(self, realm, item_id, seen, market, min_price, quantity, scans=None):
        self.scans[(item_id, seen)] = dict(ruleset=self.ruleset, item_id=item_id, seen=seen, realm=realm, market=market,
                                           min_price=min_price, quantity=quantity, scans=scans, upload_id=self.upload_id)

    def point(self, realm, item_id, t, market, quantity):
        self.history[(item_id, t)] = dict(ruleset=self.ruleset, item_id=item_id, t=t, realm=realm, market=market,
                                          quantity=quantity, upload_id=self.upload_id)


def from_tradeskills(db, fac, pts):
    """Tradeskills (Blackthornes_TS.lua): prices[realm][item] = {seen, market, min, quantity, history = {{t, m, q}}}."""
    prices = {r: t for r, t in (db.get('prices') or {}).items() if isinstance(t, dict)}
    # realm keys look like "Realm-Horde"; when they carry a faction, keep only this auction house's faction
    if fac and any(str(r).endswith(('-Horde', '-Alliance')) for r in prices):
        prices = {r: t for r, t in prices.items() if str(r).endswith('-' + fac)}
    for realm, table in prices.items():
        for item_id, rec in table.items():
            if not isinstance(rec, dict) or not isinstance(item_id, int):
                continue
            if rec.get('seen'):
                pts.scan(str(realm), item_id, int(rec['seen']), num(rec.get('market')), num(rec.get('min')),
                         num(rec.get('quantity')), num(rec.get('scans')))
            for p in lua_sv.as_list(rec.get('history')):
                if isinstance(p, dict) and p.get('t'):
                    pts.point(str(realm), item_id, int(p['t']), num(p.get('m')), num(p.get('q')))
    return [f'Tradeskills {r}' for r in sorted(map(str, prices))]


def from_auctiondb(sv, fac, pts):
    """AuctionDB, WoW Forever edition (AuctionDB.lua): houses[faction] = {items = {[id] = "ts,min,median,qty ..."}
    (every full scan of the last days), daily = {[id] = "ts,min,median,qty,scans ..."} (older days, one per day)}.
    Full scans of the whole auction house, so the best source. Houses are per faction; the realm is not stored."""
    house = (sv.get('houses') or {}).get(fac or '')
    if not isinstance(house, dict):
        return []
    for key in ('items', 'daily'):
        for item_id, text in (house.get(key) or {}).items():
            if not isinstance(item_id, int) or not isinstance(text, str):
                continue
            for entry in text.split():
                v = [int(float(x)) if x else 0 for x in entry.split(',')]
                if len(v) < 4 or not v[0]:
                    continue
                ts, low, median, qty = v[:4]
                if key == 'items':
                    pts.scan(fac, item_id, ts, median or low or None, low or None, qty)
                else:
                    pts.point(fac, item_id, ts, median or low or None, qty)
    return [f'AuctionDB {fac}']


# Auctionator counts days from 2020-01-01 (Auctionator.Constants.SCAN_DAY_0); not yet checked against a Forever file
AUCTIONATOR_DAY0 = 1577836800


def from_auctionator(db, fac, pts):
    """Auctionator (Auctionator.lua): AUCTIONATOR_PRICE_DATABASE["Realm Faction"][itemKey] = {m = latest min price,
    l = {[day] = lowest price}, h = {[day] = highest}, a = {[day] = quantity available}}. One point per day only."""
    realms = [r for r in db if isinstance(r, str) and isinstance(db[r], dict) and (not fac or r.endswith(' ' + fac))]
    for realm in realms:
        for key, rec in db[realm].items():
            item_id = key if isinstance(key, int) else int(key) if isinstance(key, str) and key.isdigit() else None
            if not item_id or not isinstance(rec, dict):
                continue
            low, avail = rec.get('l') or {}, rec.get('a') or {}
            days = [d for d in low if isinstance(d, int)]
            for d in days:
                pts.point(realm, item_id, AUCTIONATOR_DAY0 + d * 86400 + 43200, num(low[d]), num(avail.get(d)))
            if days and num(rec.get('m')):
                d = max(days)
                pts.scan(realm, item_id, AUCTIONATOR_DAY0 + d * 86400 + 43200, num(rec['m']), num(rec['m']),
                         num(avail.get(d)))
    return [f'Auctionator {r}' for r in sorted(realms)]


FORMATS = (('BlackthornesTSDB', from_tradeskills), ('AuctionDBForeverSaved', from_auctiondb),
           ('AUCTIONATOR_PRICE_DATABASE', from_auctionator))


def parse(text, ruleset, upload_id):
    """Prices of this auction house from a Tradeskills, AuctionDB or Auctionator file -> (scans, history, sources)."""
    sv = lua_sv.loads(text)
    fac = faction_of(ruleset)
    pts, sources = Points(ruleset, upload_id), []
    known = [(name, fn) for name, fn in FORMATS if isinstance(sv.get(name), dict)]
    if not known:
        raise ValueError('keine Daten von AuctionDB, Auctionator oder Tradeskills in der Datei')
    for name, fn in known:
        sources += fn(sv[name], fac, pts)
    if not pts.scans and not pts.history:
        raise ValueError(f'keine Preise für {fac or ruleset} in der Datei')
    return list(pts.scans.values()), list(pts.history.values()), sources


def store(table, rows, conflict):
    for i in range(0, len(rows), BATCH):
        rest('POST', table, f'on_conflict={conflict}', rows[i:i + BATCH],
             prefer='resolution=ignore-duplicates,return=minimal')


def process(u, con):
    raw = storage_get(u['file_path'])
    if raw is None:
        raise ValueError('Datei nicht im Speicher gefunden')
    scans, history, realms = parse(raw.decode('utf-8', errors='replace'), u['ruleset'], u['id'])
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
    for r in RULESETS:
        cons[r] = local(r) if os.path.exists(os.path.join(DATA_DIR, f'{r}.db')) else resync(r)
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
        except Exception:
            log.exception('Durchlauf fehlgeschlagen, nächster Versuch in %d s', INTERVAL)
        time.sleep(INTERVAL)


if __name__ == '__main__':
    main()
