"""Phase 2: archive the AH add-ons' saved prices after every AH session and append them to ah.db.

Reads AuctionDB.lua (AuctionDB, WoW Forever edition), Auctionator.lua, aux-addon.lua and Blackthornes_TS.lua (Tradeskills), whichever
are there (ah/scanfiles.py), and keeps the auction house of the faction in config.json "ruleset".
Run after you logged out or typed /reload (only then does the game write the files):
    python ah/snapshot.py
    python ah/snapshot.py --wow "D:\\Games\\World of Warcraft\\_forever_"
    python ah/snapshot.py --file some/AuctionDB.lua      (import one file, e.g. a test)
"""
import argparse, glob, hashlib, json, os, shutil, sqlite3, sys, time
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scanfiles, rawscan, blackthornes

DEFAULT_WOW = r'C:\Program Files (x86)\World of Warcraft\_forever_'
SV_NAMES = ('AuctionDB.lua', 'Auctionator.lua', 'aux-addon.lua', 'Blackthornes_TS.lua')
DB_PATH = os.path.join(HERE, 'ah.db')
SNAP_DIR = os.path.join(HERE, 'snapshots')

SCHEMA = """
CREATE TABLE IF NOT EXISTS scans (      -- one row per item and scan ("seen" = when it was scanned)
    realm TEXT, item_id INTEGER, seen INTEGER, market INTEGER, min INTEGER, rival INTEGER,
    quantity INTEGER, scans INTEGER, snap_ts INTEGER, PRIMARY KEY (realm, item_id, seen));
CREATE TABLE IF NOT EXISTS history (    -- older points per item (Tradeskills ring, AuctionDB/Auctionator days)
    realm TEXT, item_id INTEGER, t INTEGER, market INTEGER, quantity INTEGER, PRIMARY KEY (realm, item_id, t));
CREATE TABLE IF NOT EXISTS hourly (     -- cheapest price per hour (crafted/used/starred items only, 14 days)
    realm TEXT, item_id INTEGER, hour INTEGER, price INTEGER, listed INTEGER, PRIMARY KEY (realm, item_id, hour));
CREATE TABLE IF NOT EXISTS snapshots (file TEXT PRIMARY KEY, sha1 TEXT, taken INTEGER, items INTEGER);
CREATE TABLE IF NOT EXISTS tsm (        -- TradeSkillMaster public data (ah/tsm.py): sales per day per item
    realm TEXT, item_id INTEGER, t INTEGER, market INTEGER, sold_per_day REAL, sale_rate REAL, PRIMARY KEY (realm, item_id, t));
"""


def find_files(wow):
    return sorted(f for name in SV_NAMES for f in glob.glob(os.path.join(wow, 'WTF', 'Account', '*', 'SavedVariables', name)))


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


def house():
    """(realm label in ah.db, faction) from config.json: one auction house, whichever add-on scanned it."""
    cfg = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
    ruleset = cfg.get('ruleset') or ''
    faction = 'Horde' if ruleset.lower().endswith('horde') else 'Alliance' if ruleset.lower().endswith('alliance') else None
    return cfg.get('realm') or ruleset or 'eigene Scans', faction


def ingest(con, path, sha1):
    realm, faction = house()
    p = scanfiles.read(open(path, 'rb').read(), faction)
    now = int(time.time())
    # points from the future (wrong PC clock or an edited file) would sit at the end of every price line: drop them,
    # as the website's worker does
    cutoff = now + 2 * 3600
    con.executemany('INSERT OR IGNORE INTO scans VALUES (?,?,?,?,?,?,?,?,?)',
                    [(realm, i, t, m, lo, None, q, n, now) for _, i, t, m, lo, q, n in p.scans.values() if t <= cutoff])
    con.executemany('INSERT OR IGNORE INTO history VALUES (?,?,?,?,?)',
                    [(realm, i, t, m, q) for _, i, t, m, q in p.history.values() if t <= cutoff])
    con.execute('INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?)', (os.path.basename(path), sha1, now, len(p.scans)))
    con.commit()
    return len(p.scans), len(p.history), p.sources


def raw_backfill(con, paths):
    """AuctionDB's recorded full scans (single auctions, ah/rawscan.py) from every archived file not read yet."""
    realm, faction = house()
    con.execute('CREATE TABLE IF NOT EXISTS raw_files (file TEXT PRIMARY KEY)')
    done = {f for f, in con.execute('SELECT file FROM raw_files')}
    scans = pairs = 0
    for path in paths:
        name = os.path.basename(path)
        if name in done:
            continue
        raw = open(path, 'rb').read()
        if raw[:200].lstrip().startswith(b'AuctionDB') and b'["dataFormatVersion"]' in raw:
            s, p, _ = rawscan.ingest(con, raw, realm, faction)
            scans, pairs = scans + s, pairs + p
        con.execute('INSERT OR IGNORE INTO raw_files VALUES (?)', (name,))
        con.commit()
    return scans, pairs


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('--wow', default=DEFAULT_WOW, help='Forever-Spielordner (der mit WTF darin)')
    ap.add_argument('--file', help='eine einzelne SavedVariables-Datei importieren')
    a = ap.parse_args()
    files = [a.file] if a.file else find_files(a.wow)
    if not files:
        raise SystemExit(f'Keine {", ".join(SV_NAMES)} unter {a.wow}\\WTF\\Account\\*\\SavedVariables gefunden. '
                         'Ist AuctionDB, Auctionator, aux oder Tradeskills im Forever-Ordner installiert und warst du einmal '
                         'ausgeloggt / /reload?')
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    for f in files:
        copy, sha1 = archive(f)
        if copy is None and not a.file:
            print(f'{f}: unverändert seit dem letzten Snapshot, übersprungen')
            continue
        try:
            n, h, sources = ingest(con, copy or f, sha1)
        except ValueError as e:
            print(f'{os.path.basename(f)}: {e}')
            continue
        print(f'{os.path.basename(copy or f)}: {n} Preise, {h} Verlaufspunkte übernommen ({", ".join(sources)})')
    s, p = raw_backfill(con, sorted(glob.glob(os.path.join(SNAP_DIR, '*.lua'))) + ([a.file] if a.file else []))
    if s or p:
        print(f'Rohscans (einzelne Auktionen): {s} neue Scans, {p} neue Scan-Paare mit Verkäufen gemessen (python ah/rawscan.py)')
    try:   # vendor prices, deposits, own professions from the Tradeskills add-on (ah/blackthornes.py)
        msg = blackthornes.export(a.wow)
        if msg:
            print(msg)
    except Exception as e:
        print(f'Blackthornes nicht gelesen: {e}')
    total = con.execute('SELECT COUNT(*), COUNT(DISTINCT item_id), COUNT(DISTINCT seen) FROM scans').fetchone()
    print(f'ah.db: {total[0]} Messungen, {total[1]} Items, {total[2]} Scan-Zeitpunkte')


if __name__ == '__main__':
    main()
