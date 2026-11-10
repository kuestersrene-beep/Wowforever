"""TradeSkillMaster public data (https://tradeskillmaster.com/public-data) as an extra price source.

TSM publishes per realm / region a CSV with market value, 60-day historical value, average sale price, sale rate and
sold per day, updated every few hours, free and without a key. No AH quantities and no lowest buyout.

Live use only:
- Live (config.json "tsm"): your own auction house. Prices and sold per day go into ah.db next to your own scans.
  There is no WoW Forever data at TSM yet (as of 01.11.2026). While "tsm" is empty, every run checks (at most once a
  day) whether TSM offers Forever data under one of "tsm_kandidaten" and, if so, enters the path itself.

    python ah/tsm.py                      -> live import (or the Forever check while "tsm" is empty)
    python ah/tsm.py forever/eu/realm/x   -> that path once
"""
import csv, io, json, os, shutil, sqlite3, sys, time, urllib.error, urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://public-data.tradeskillmaster.com/'
DAY = 86400
# where TSM might put WoW Forever (its game slugs today: retail, classic, and one per Classic progression version)
CANDIDATES = ['forever/eu/region', 'wow-forever/eu/region', 'classic-forever/eu/region', 'forever-classic/eu/region']


def _get(path):
    req = urllib.request.Request(BASE + path.strip('/') + '/items.csv',
                                 headers={'User-Agent': 'BlackwaterTerminal/1.0 (WoW guild AH tool)'})  # bare urllib gets 403
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode('utf-8')


def parse(text):
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            t = int(datetime.fromisoformat(r['updatedAt'].replace('Z', '+00:00')).timestamp())
            num = lambda k: int(float(r.get(k) or 0)) or None
            out.append(dict(item_id=int(r['itemId']), market=num('marketValue'), historical=num('historical'),
                            avg_sale=num('avgSalePrice'), t=t, sold_per_day=float(r['soldPerDay'] or 0),
                            sale_rate=float(r['saleRate'] or 0)))
        except (KeyError, ValueError):
            continue
    return out


def fetch(path, cache=None, max_age=DAY):
    """Rows of a TSM items.csv, or None when TSM has no such file (404). With cache: a local copy younger than
    max_age is used instead of the network, and the network result is saved there; offline, an older copy is used."""
    if cache and os.path.exists(cache) and time.time() - os.path.getmtime(cache) < max_age:
        return parse(open(cache, encoding='utf-8').read())
    try:
        text = _get(path)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    except OSError:
        if cache and os.path.exists(cache):
            return parse(open(cache, encoding='utf-8').read())
        raise
    if cache:
        open(cache, 'w', encoding='utf-8').write(text)
    return parse(text)


def archive(path, snapdir):
    """Fetches path (at most once a day, cached as latest.csv) and keeps one copy per day as YYYY-MM-DD.csv, named
    after TSM's own update time. TSM publishes no history, so these copies are the history. Returns the latest rows."""
    os.makedirs(snapdir, exist_ok=True)
    rows = fetch(path, cache=os.path.join(snapdir, 'latest.csv'), max_age=6 * 3600)
    if rows:
        day_file = os.path.join(snapdir, datetime.fromtimestamp(max(r['t'] for r in rows)).strftime('%Y-%m-%d') + '.csv')
        if not os.path.exists(day_file):
            shutil.copy(os.path.join(snapdir, 'latest.csv'), day_file)
    return rows


def find_forever(candidates=None):
    """First path under which TSM offers data for WoW Forever, or None."""
    for path in candidates or CANDIDATES:
        try:
            _get(path)
            return path
        except (urllib.error.HTTPError, OSError):
            continue
    return None


def store(con, realm, rows):
    """Writes the rows into an ah.db-style database (realm column = auction house label). Returns the count."""
    con.execute('CREATE TABLE IF NOT EXISTS tsm (realm TEXT, item_id INTEGER, t INTEGER, market INTEGER, '
                'sold_per_day REAL, sale_rate REAL, PRIMARY KEY (realm, item_id, t))')
    cols = {c[1] for c in con.execute('PRAGMA table_info(tsm)')}
    for c in ('avg_sale', 'historical'):  # added later: older databases get the columns here
        if c not in cols:
            con.execute(f'ALTER TABLE tsm ADD COLUMN {c} INTEGER')
    con.executemany('INSERT OR IGNORE INTO scans VALUES (?,?,?,?,?,?,?,?,?)',
                    [(realm, r['item_id'], r['t'], r['market'], r['market'], None, None, None, int(time.time()))
                     for r in rows if r['market']])
    con.executemany('INSERT OR IGNORE INTO tsm (realm, item_id, t, market, sold_per_day, sale_rate, avg_sale, historical) '
                    'VALUES (?,?,?,?,?,?,?,?)',
                    [(realm, r['item_id'], r['t'], r['market'], r['sold_per_day'], r['sale_rate'], r.get('avg_sale'),
                      r.get('historical')) for r in rows])
    con.commit()
    return len(rows)


def check_forever(cfg_path):
    """While config.json "tsm" is empty: at most once a day look for Forever data at TSM and enter the path."""
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    if cfg.get('tsm'):
        return cfg['tsm']
    stamp = os.path.join(HERE, 'tsm_check.json')
    try:
        last = json.load(open(stamp, encoding='utf-8'))
    except (OSError, ValueError):
        last = {}
    if time.time() - last.get('checked', 0) < DAY:
        print(f'TSM: noch keine Forever-Daten (zuletzt geprüft {datetime.fromtimestamp(last["checked"]):%d.%m. %H:%M}).')
        return None
    found = find_forever(cfg.get('tsm_kandidaten') or None)
    json.dump({'checked': time.time(), 'found': found}, open(stamp, 'w', encoding='utf-8'))
    if not found:
        print('TSM: noch keine Forever-Daten. Nächste Prüfung in 24 Stunden.')
        return None
    text = open(cfg_path, encoding='utf-8').read()
    text = text.replace('"tsm": ""', f'"tsm": "{found}"', 1)
    open(cfg_path, 'w', encoding='utf-8', newline='').write(text)
    print('=' * 70 + f'\nTSM bietet jetzt WoW-Forever-Daten an: {found}\n'
          'Der Pfad steht ab sofort in ah/config.json ("tsm") und wird bei jedem Scan mitgeladen.\n' + '=' * 70)
    return found


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    sys.path.insert(0, HERE)
    import snapshot
    cfg_path = os.path.join(HERE, 'config.json')
    path = sys.argv[1] if len(sys.argv) > 1 else check_forever(cfg_path)
    if not path:
        return
    rows = fetch(path)
    if rows is None:
        print(f'TSM: unter {path} gibt es (noch) keine Daten.')
        return
    con = sqlite3.connect(snapshot.DB_PATH)
    con.executescript(snapshot.SCHEMA)
    realm, _ = snapshot.house()
    print(f'TSM: {store(con, realm, rows)} Items aus {path} übernommen')


if __name__ == '__main__':
    main()
