"""Phase 2: archive Tradeskills' saved prices after every AH session and append them to ah.db.

Run after you logged out or typed /reload (only then does the game write the file):
    python ah/snapshot.py
    python ah/snapshot.py --wow "D:\\Games\\World of Warcraft\\_forever_"
    python ah/snapshot.py --file some/Blackthornes_TS.lua      (import one file, e.g. a test)
"""
import argparse, glob, hashlib, os, shutil, sqlite3, sys, time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lua_sv

DEFAULT_WOW = r'C:\Program Files (x86)\World of Warcraft\_forever_'
SV_NAME = 'Blackthornes_TS.lua'
DB_PATH = os.path.join(HERE, 'ah.db')
SNAP_DIR = os.path.join(HERE, 'snapshots')

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (      -- one row per item and Tradeskills reading ("seen" = when it was scanned)
    realm TEXT, item_id INTEGER, seen INTEGER, market INTEGER, min INTEGER, rival INTEGER,
    quantity INTEGER, scans INTEGER, snap_ts INTEGER, PRIMARY KEY (realm, item_id, seen));
CREATE TABLE IF NOT EXISTS history (    -- Tradeskills' own ring of the last 12 readings per item
    realm TEXT, item_id INTEGER, t INTEGER, market INTEGER, quantity INTEGER, PRIMARY KEY (realm, item_id, t));
CREATE TABLE IF NOT EXISTS hourly (     -- cheapest price per hour (crafted/used/starred items only, 14 days)
    realm TEXT, item_id INTEGER, hour INTEGER, price INTEGER, listed INTEGER, PRIMARY KEY (realm, item_id, hour));
CREATE TABLE IF NOT EXISTS snapshots (file TEXT PRIMARY KEY, sha1 TEXT, taken INTEGER, items INTEGER);
"""


def find_files(wow):
    return sorted(glob.glob(os.path.join(wow, 'WTF', 'Account', '*', 'SavedVariables', SV_NAME)))


def archive(path):
    """Copies the file into snapshots/ unless an identical copy is already there. Returns (copy, sha1) or (None, sha1)."""
    data = open(path, 'rb').read()
    sha1 = hashlib.sha1(data).hexdigest()
    os.makedirs(SNAP_DIR, exist_ok=True)
    for f in os.listdir(SNAP_DIR):
        if f.endswith(sha1[:10] + '.lua'):
            return None, sha1
    account = os.path.basename(os.path.dirname(os.path.dirname(path)))
    stamp = datetime.fromtimestamp(os.path.getmtime(path)).strftime('%Y%m%d-%H%M%S')
    copy = os.path.join(SNAP_DIR, f'{account}_{stamp}_{sha1[:10]}.lua')
    shutil.copy2(path, copy)
    return copy, sha1


def pairs_list(v):
    """priceHistory lists are flat: hour, value, hour, value, ..."""
    flat = lua_sv.as_list(v)
    return [(flat[i], flat[i + 1]) for i in range(0, len(flat) - 1, 2)]


def ingest(con, path, sha1):
    sv = lua_sv.load(path)
    db = sv.get('BlackthornesTSDB')
    if not isinstance(db, dict):
        raise SystemExit(f'{path}: no BlackthornesTSDB in the file')
    now = int(time.time())
    n = 0
    for realm, table in (db.get('prices') or {}).items():
        if not isinstance(table, dict):
            continue
        for item_id, rec in table.items():
            if not isinstance(rec, dict) or not isinstance(item_id, int):
                continue
            seen = rec.get('seen')
            if seen:
                con.execute('INSERT OR IGNORE INTO scans VALUES (?,?,?,?,?,?,?,?,?)',
                            (realm, item_id, int(seen), rec.get('market'), rec.get('min'), rec.get('rival'),
                             rec.get('quantity'), rec.get('scans'), now))
                n += 1
            for point in lua_sv.as_list(rec.get('history')):
                if isinstance(point, dict) and point.get('t'):
                    con.execute('INSERT OR IGNORE INTO history VALUES (?,?,?,?,?)',
                                (realm, item_id, int(point['t']), point.get('m'), point.get('q')))
    listed = {}
    for realm, table in (db.get('priceListed') or {}).items():
        for item_id, v in (table or {}).items():
            for hour, qty in pairs_list(v):
                listed[(realm, item_id, hour)] = qty
    for realm, table in (db.get('priceHistory') or {}).items():
        for item_id, v in (table or {}).items():
            for hour, price in pairs_list(v):
                con.execute('INSERT OR REPLACE INTO hourly VALUES (?,?,?,?,?)',
                            (realm, item_id, int(hour), price, listed.get((realm, item_id, hour))))
    con.execute('INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?)', (os.path.basename(path), sha1, now, n))
    con.commit()
    return n


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('--wow', default=DEFAULT_WOW, help='Forever-Spielordner (der mit WTF darin)')
    ap.add_argument('--file', help='eine einzelne SavedVariables-Datei importieren')
    a = ap.parse_args()
    files = [a.file] if a.file else find_files(a.wow)
    if not files:
        raise SystemExit(f'Keine {SV_NAME} unter {a.wow}\\WTF\\Account\\*\\SavedVariables gefunden. '
                         'Ist Tradeskills im Forever-Ordner installiert und warst du einmal ausgeloggt / /reload?')
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    for f in files:
        copy, sha1 = archive(f)
        if copy is None and not a.file:
            print(f'{f}: unverändert seit dem letzten Snapshot, übersprungen')
            continue
        n = ingest(con, copy or f, sha1)
        realms = [r[0] for r in con.execute('SELECT DISTINCT realm FROM scans')]
        print(f'{os.path.basename(copy or f)}: {n} Preise übernommen. Realms: {", ".join(realms)}')
    total = con.execute('SELECT COUNT(*), COUNT(DISTINCT item_id), COUNT(DISTINCT seen) FROM scans').fetchone()
    print(f'ah.db: {total[0]} Messungen, {total[1]} Items, {total[2]} Scan-Zeitpunkte')


if __name__ == '__main__':
    main()
