"""TradeSkillMaster public data (https://tradeskillmaster.com/public-data) as an extra price source.

TSM publishes per realm / region a CSV with market value, average sale price, sale rate and sold per day, updated every
few hours, free and without a key. There is no WoW Forever data yet (as of 01.11.2026); this module is ready for when
there is. Classic / Retail data must never feed the evaluation (other economies), only tests.

    python ah/tsm.py                      -> uses "tsm" from ah/config.json (e.g. "forever/eu/realm/<realm>")
    python ah/tsm.py forever/eu/realm/x   -> that path

Stored in ah.db: one price point per item (scans, market = TSM market value) and the sales in table tsm
(sold_per_day, sale_rate). analyse.py takes sold_per_day as sell-through where its own scans can't measure it.
"""
import csv, io, json, os, sqlite3, sys, time, urllib.error, urllib.request
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://public-data.tradeskillmaster.com/'


def fetch(path):
    """Rows of a TSM items.csv, or None when TSM has no such file (404)."""
    try:
        req = urllib.request.Request(BASE + path.strip('/') + '/items.csv',
                                     headers={'User-Agent': 'BlackwaterTerminal/1.0 (WoW guild AH tool)'})  # bare urllib gets 403
        with urllib.request.urlopen(req, timeout=60) as res:
            text = res.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise
    out = []
    for r in csv.DictReader(io.StringIO(text)):
        try:
            t = int(datetime.fromisoformat(r['updatedAt'].replace('Z', '+00:00')).timestamp())
            out.append(dict(item_id=int(r['itemId']), market=int(float(r['marketValue'] or 0)) or None, t=t,
                            sold_per_day=float(r['soldPerDay'] or 0), sale_rate=float(r['saleRate'] or 0)))
        except (KeyError, ValueError):
            continue
    return out


def store(con, realm, rows):
    """Writes the rows into an ah.db-style database (realm column = auction house label). Returns the count."""
    con.execute('CREATE TABLE IF NOT EXISTS tsm (realm TEXT, item_id INTEGER, t INTEGER, market INTEGER, '
                'sold_per_day REAL, sale_rate REAL, PRIMARY KEY (realm, item_id, t))')
    con.executemany('INSERT OR IGNORE INTO scans VALUES (?,?,?,?,?,?,?,?,?)',
                    [(realm, r['item_id'], r['t'], r['market'], r['market'], None, None, None, int(time.time()))
                     for r in rows if r['market']])
    con.executemany('INSERT OR IGNORE INTO tsm VALUES (?,?,?,?,?,?)',
                    [(realm, r['item_id'], r['t'], r['market'], r['sold_per_day'], r['sale_rate']) for r in rows])
    con.commit()
    return len(rows)


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    sys.path.insert(0, HERE)
    import snapshot
    cfg = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
    path = sys.argv[1] if len(sys.argv) > 1 else cfg.get('tsm', '')
    if not path:
        print('TSM: kein Pfad in ah/config.json ("tsm"), übersprungen.')
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
