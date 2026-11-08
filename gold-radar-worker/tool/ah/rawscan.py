"""Phase 2b: AuctionDB's recorded full scans (option "Record full scans"): every single auction, not only the per-item
summary (min / median / quantity) that ah/scanfiles.py reads.

What the single auctions add:
- sales: an auction that is gone in the next scan although its time-left band says it cannot have expired yet was
  bought out (or cancelled). Two scans a few hours apart therefore measure what the market really buys per day,
  and at which unit prices. The summary can only see that the listed quantity went down, and new listings hide
  every sale in it.
- depth: how many units sit within 10 / 25 / 50 % of the cheapest one (a "wall" or a thin top), fresh listings,
  bids.

File format (AuctionDB Record.lua, classic AHDB format 6):
    saved.ah = {{ts, faction, realm, char, count, itemsCount, data}, ...}  the last keepScans scans per house
    data = "key!seller/timeLeft,count,minBid,buyout,curBid&auction2...!seller2/... key2!..."  (zeros left out)
    key = short item link ("i2589", random suffix gear "i9829@1:12760"); WoW Forever sends no seller names
    timeLeft = the client's time-left value + 1: in WoW Forever's files 2 short, 3 medium, 4 long, 5 very long (the
    classic values 1-4 plus one; never 1); buyout is for the whole stack
    saved.itemDB_2[key] = "sellPrice,stackCount,classID,subClassID,rarity,minLevel" .. item link

Whether a gone auction could have expired: the least time an auction in that band still had. Classic bands are
<30 min / 30 min-2 h / 2-8 h / >8 h, the modern client's 2-12 h / >12 h; the smaller values are taken (and a file
written with the modern 0-3 + 1 would only be read more cautiously), so a sale is only counted where expiry is
impossible either way. Gone auctions that might have expired are counted at the rate
at which the same item's safe auctions were bought in that interval. Gone auctions whose stack size was posted
again fresh at another price may be a repost (cancel and undercut) instead of a sale: reported as "relist", and the
lower estimate leaves them out.

    python ah/rawscan.py              sales of the last 3 days from ah.db (after ah/snapshot.py)
    python ah/rawscan.py --top 60
"""
import argparse, json, os, re, sqlite3, sys, time
from collections import defaultdict
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lua_sv

BAND_MIN = {1: 0, 2: 0, 3: 30 * 60, 4: 2 * 3600, 5: 8 * 3600}   # stored time-left value -> seconds left at least
FRESH = 5                    # very long: posted in the last hours
PULL_FACTOR = 2.0            # gone at more than this times a cheaper one that stayed: pulled, not bought
MAX_GAP = 12 * 3600          # scans further apart: nearly every auction may have expired in between, no measurement
KEEP_LISTINGS = 4 * 86400    # single auctions kept in ah.db
KEEP_DEPTH = 30 * 86400      # depth per scan kept this long (sales stay)
D = 86400

SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_scans (  -- AuctionDB's recorded full scans
    realm TEXT, ts INTEGER, auctions INTEGER, items INTEGER, char TEXT, PRIMARY KEY (realm, ts));
CREATE TABLE IF NOT EXISTS listings (   -- the single auctions of a scan, per item as in the file (pruned after 4 days)
    realm TEXT, ts INTEGER, item_id INTEGER, data TEXT, PRIMARY KEY (realm, ts, item_id));
CREATE TABLE IF NOT EXISTS depth (      -- market depth per item and scan
    realm TEXT, item_id INTEGER, ts INTEGER, auctions INTEGER, units INTEGER, min INTEGER, median INTEGER,
    u110 INTEGER, u125 INTEGER, u150 INTEGER, cost150 INTEGER, fresh INTEGER, short INTEGER, bids INTEGER,
    PRIMARY KEY (realm, item_id, ts));
CREATE TABLE IF NOT EXISTS sales (      -- what was bought between two consecutive full scans
    realm TEXT, item_id INTEGER, t0 INTEGER, t1 INTEGER, units0 INTEGER, gone INTEGER, sold_safe INTEGER,
    safe_units INTEGER, unsure_gone INTEGER, unsure_units INTEGER, relist INTEGER, new_units INTEGER,
    pulled INTEGER, sold_value INTEGER, top_unit INTEGER, PRIMARY KEY (realm, item_id, t0, t1));
CREATE TABLE IF NOT EXISTS scan_pairs (realm TEXT, t0 INTEGER, t1 INTEGER, PRIMARY KEY (realm, t0, t1));
CREATE TABLE IF NOT EXISTS item_meta (  -- from AuctionDB's item DB: name as the client shows it, vendor price, ...
    item_id INTEGER PRIMARY KEY, name TEXT, sell INTEGER, stack INTEGER, class INTEGER, subclass INTEGER,
    rarity INTEGER, min_level INTEGER);
"""

_ID = re.compile(r'^i(\d+)')


def text(s):
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def auctions_of(data):
    """item_id -> [(variant, timeLeft, count, minBid, buyout, curBid)] from a scan's data string."""
    out = defaultdict(list)
    for entry in data.split(' '):
        key, _, rest = entry.partition('!')
        m = _ID.match(key)
        if not m or not rest:
            continue
        item = int(m.group(1))
        for group in rest.split('!'):
            _, _, aucs = group.partition('/')
            for a in aucs.split('&'):
                v = a.split(',')
                if len(v) < 5:
                    continue
                tl, cnt, mb, bo, cb = (int(x) if x else 0 for x in v[:5])
                out[item].append((key, min(max(tl, 1), FRESH), cnt or 1, mb, bo, cb))
    return out


def encode(aucs):
    return '&'.join(f'{k},{tl},{c},{mb},{bo},{cb}' for k, tl, c, mb, bo, cb in aucs)


def decode(s):
    out = []
    for a in s.split('&'):
        k, tl, c, mb, bo, cb = a.rsplit(',', 5)
        out.append((k, int(tl), int(c), int(mb), int(bo), int(cb)))
    return out


def read(raw, faction=None):
    """(scans, meta) of a SavedVariables file's bytes: scans = [dict(ts, realm, char, count, items={id: auctions})],
    meta = {item_id: dict(name, sell, stack, class, subclass, rarity, min_level)}. Empty if nothing was recorded."""
    sv = lua_sv.loads(raw.decode('latin-1'))
    adb = next((v for k, v in sv.items() if k.startswith('AuctionDB') and isinstance(v, dict) and 'houses' in v), None)
    if not adb:
        return [], {}
    scans = []
    for s in lua_sv.as_list(adb.get('ah')):
        if not isinstance(s, dict) or not s.get('ts') or not isinstance(s.get('data'), str):
            continue
        if faction and s.get('faction') not in (faction, None):
            continue
        scans.append(dict(ts=int(s['ts']), realm=text(str(s.get('realm') or '')), char=text(str(s.get('char') or '')),
                          count=int(s.get('count') or 0), items=auctions_of(s['data'])))
    meta = {}
    for key, v in (adb.get('itemDB_2') or {}).items():
        m = _ID.match(str(key))
        if not m or not isinstance(v, str):
            continue
        item = int(m.group(1))
        if item in meta and str(key) != f'i{item}':
            continue   # the plain item's entry wins over its random-suffix variants
        info, _, link = v.partition('|')
        name = re.search(r'\|h\[(.*?)\]\|h', '|' + link)
        f = info.split(',')
        row = dict(name=text(name.group(1)) if name else None)
        if len(f) == 6 and all(x.lstrip('-').isdigit() for x in f):
            row.update(zip(('sell', 'stack', 'class', 'subclass', 'rarity', 'min_level'), map(int, f)))
        meta[item] = row
    return scans, meta


def unit(a):
    return a[4] // a[2] if a[4] else 0


def depth_of(aucs):
    units = sum(a[2] for a in aucs)
    priced = sorted((unit(a), a[2]) for a in aucs if a[4])
    lo = priced[0][0] if priced else 0
    med, acc = 0, 0
    for p, c in priced:
        acc += c
        if 2 * acc >= sum(c for _, c in priced):
            med = p
            break
    within = lambda f: sum(c for p, c in priced if p <= lo * f)
    return dict(auctions=len(aucs), units=units, min=lo, median=med, u110=within(1.10), u125=within(1.25),
                u150=within(1.50), cost150=sum(p * c for p, c in priced if p <= lo * 1.5),
                fresh=sum(a[2] for a in aucs if a[1] == FRESH), short=sum(a[2] for a in aucs if a[1] <= 3),
                bids=sum(1 for a in aucs if a[5]))


def compare(a, b, dt):
    """What happened to one item's auctions between two scans dt seconds apart."""
    def sig(x):   # what identifies an auction without an id: variant, stack size, prices set by the seller
        return x[0], x[2], x[3], x[4]
    A, B = defaultdict(list), defaultdict(list)
    for x in a:
        A[sig(x)].append(x)
    for x in b:
        B[sig(x)].append(x)
    gone, new, kept = [], [], []
    for s, xa in A.items():
        xb = sorted(B.get(s, []), key=lambda x: x[1])
        xa = sorted(xa, key=lambda x: x[1])
        # an auction can only be the same one later if its time left did not grow; the ones with the least time left
        # stay unmatched first, so a gone auction is "maybe expired" rather than "sold" where it is ambiguous
        j = 0
        for x in xa:
            if j < len(xb) and xb[j][1] <= x[1]:
                j += 1
                kept.append(x)
            else:
                gone.append(x)
        new += xb[j:]
    for s, xb in B.items():
        if s not in A:
            new += xb
    # buyers take the cheapest first: a gone auction far above one of the same variant that stayed unbought the whole
    # time was pulled (cancelled, a fantasy price), not bought. Small stacks may cost a bit more per unit, hence 2x.
    cheapest_kept = {}
    for x in kept:
        if x[4]:
            cheapest_kept[x[0]] = min(cheapest_kept.get(x[0], unit(x)), unit(x))
    pulled = [x for x in gone if x[4] and x[0] in cheapest_kept and unit(x) > PULL_FACTOR * cheapest_kept[x[0]]]
    gone_ok = [x for x in gone if not (x[4] and x[0] in cheapest_kept and unit(x) > PULL_FACTOR * cheapest_kept[x[0]])]
    units0 = sum(x[2] for x in a)
    safe_units = sum(x[2] for x in a if BAND_MIN[x[1]] > dt)
    sold_safe = [x for x in gone_ok if BAND_MIN[x[1]] > dt or x[5]]   # with a bid it went to the bidder in any case
    unsure = [x for x in gone_ok if not (BAND_MIN[x[1]] > dt or x[5])]
    # reposts: a gone stack size posted fresh again at another price in the same interval
    fresh = defaultdict(int)
    for x in new:
        if x[1] == FRESH:
            fresh[(x[0], x[2])] += 1
    relist = 0
    for x in sold_safe:
        k = (x[0], x[2])
        if fresh[k] > 0:
            fresh[k] -= 1
            relist += x[2]
    # the price buyers still paid: 90th percentile of the sold units' unit prices (one odd sale is no price)
    paid = sorted((unit(x), x[2]) for x in sold_safe if x[4])
    top, acc, total = 0, 0, sum(c for _, c in paid)
    for pr, c in paid:
        acc += c
        if acc >= 0.9 * total:
            top = pr
            break
    return dict(units0=units0, gone=sum(x[2] for x in gone), sold_safe=sum(x[2] for x in sold_safe), safe_units=safe_units,
                unsure_gone=sum(x[2] for x in unsure), unsure_units=units0 - safe_units, relist=relist,
                new_units=sum(x[2] for x in new), pulled=sum(x[2] for x in pulled),
                sold_value=sum(unit(x) * x[2] for x in sold_safe), top_unit=top)


def ingest(con, raw, realm, faction):
    """Stores the file's recorded full scans and measures every new pair of consecutive scans.
    Returns (new scans, measured pairs, timestamps of all the file's scans). Scans from the future (wrong PC clock,
    edited file) are skipped."""
    con.executescript(SCHEMA)
    scans, meta = read(raw, faction)
    scans = [s for s in scans if s['ts'] <= time.time() + 2 * 3600]
    if meta:
        con.executemany('INSERT OR REPLACE INTO item_meta VALUES (?,?,?,?,?,?,?,?)',
                        [(i, m.get('name'), m.get('sell'), m.get('stack'), m.get('class'), m.get('subclass'), m.get('rarity'),
                          m.get('min_level')) for i, m in meta.items()])
    added = 0
    for s in scans:
        if con.execute('SELECT 1 FROM raw_scans WHERE realm=? AND ts=?', (realm, s['ts'])).fetchone():
            continue
        con.execute('INSERT INTO raw_scans VALUES (?,?,?,?,?)', (realm, s['ts'], s['count'], len(s['items']), s['char']))
        con.executemany('INSERT OR REPLACE INTO listings VALUES (?,?,?,?)',
                        [(realm, s['ts'], i, encode(a)) for i, a in s['items'].items()])
        con.executemany('INSERT OR REPLACE INTO depth VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        [(realm, i, s['ts'], *depth_of(a).values()) for i, a in s['items'].items()])
        added += 1
    pairs = measure(con, realm)
    newest = con.execute('SELECT MAX(ts) FROM raw_scans WHERE realm=?', (realm,)).fetchone()[0] or 0
    con.execute('DELETE FROM listings WHERE realm=? AND ts < ?', (realm, newest - KEEP_LISTINGS))
    con.execute('DELETE FROM depth WHERE realm=? AND ts < ?', (realm, newest - KEEP_DEPTH))
    con.commit()
    return added, pairs, [s['ts'] for s in scans]


def drop_scans(con, realm, stamps):
    """Removes full scans (e.g. of a withdrawn upload) with everything measured from them, then measures the pairs
    that close the gap (where both neighbours' auctions are still stored)."""
    stamps = list(stamps)
    if not stamps:
        return 0
    q = ','.join('?' * len(stamps))
    for table, col in (('raw_scans', 'ts'), ('listings', 'ts'), ('depth', 'ts')):
        con.execute(f'DELETE FROM {table} WHERE realm=? AND {col} IN ({q})', (realm, *stamps))
    for table in ('sales', 'scan_pairs'):
        con.execute(f'DELETE FROM {table} WHERE realm=? AND (t0 IN ({q}) OR t1 IN ({q}))', (realm, *stamps, *stamps))
    n = measure(con, realm)
    con.commit()
    return n


def measure(con, realm):
    """Sales for every pair of consecutive full scans that has not been measured yet (both scans' auctions stored)."""
    ts = [t for t, in con.execute('SELECT ts FROM raw_scans WHERE realm=? ORDER BY ts', (realm,))]
    done = {(a, b) for a, b in con.execute('SELECT t0, t1 FROM scan_pairs WHERE realm=?', (realm,))}
    n = 0
    for t0, t1 in zip(ts, ts[1:]):
        if (t0, t1) in done or t1 - t0 > MAX_GAP:
            continue
        a = {i: decode(d) for i, d in con.execute('SELECT item_id, data FROM listings WHERE realm=? AND ts=?', (realm, t0))}
        b = {i: decode(d) for i, d in con.execute('SELECT item_id, data FROM listings WHERE realm=? AND ts=?', (realm, t1))}
        if not a or not b:
            continue
        ca, cb = (sum(len(x) for x in s.values()) for s in (a, b))
        if cb < 0.7 * ca or ca < 0.7 * cb:   # one of them incomplete (throttled, AH closed): every missing auction would look sold
            con.execute('INSERT OR IGNORE INTO scan_pairs VALUES (?,?,?)', (realm, t0, t1))
            continue
        rows = []
        for i in set(a) | set(b):
            c = compare(a.get(i, []), b.get(i, []), t1 - t0)
            rows.append((realm, i, t0, t1, *c.values()))
        con.executemany('INSERT OR REPLACE INTO sales VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', rows)
        con.execute('INSERT OR IGNORE INTO scan_pairs VALUES (?,?,?)', (realm, t0, t1))
        n += 1
    return n


def sold_per_day(con, realm, now, days=3):
    """item -> dict(per_day, low, high, avg, top, new, hours, pairs): bought units per day over the measured intervals
    of the last days (new = units posted per day, reposts included). per_day counts the safe sales plus the unsure gone auctions at the item's safe sale rate; low
    leaves out possible reposts; high counts every gone auction that cannot have expired plus all unsure ones."""
    try:
        q = con.execute('SELECT item_id, t0, t1, units0, gone, sold_safe, safe_units, unsure_gone, unsure_units, relist, '
                        'sold_value, top_unit, new_units FROM sales WHERE realm=? AND t1 > ?', (realm, now - days * D)).fetchall()
        pairs = con.execute('SELECT t0, t1 FROM sales WHERE realm=? AND t1 > ? GROUP BY t0, t1', (realm, now - days * D)).fetchall()
    except sqlite3.OperationalError:
        return {}
    span = sum(t1 - t0 for t0, t1 in pairs)
    if span < 3600:
        return {}
    acc = defaultdict(lambda: [0.0, 0.0, 0.0, 0, 0, 0, 0])
    for i, t0, t1, u0, gone, ss, su, ug, uu, rl, val, mx, nu in q:
        sure = max(0, ss - rl)
        r = acc[i]
        r[0] += ss + min(ug, (ss / su if su else 0) * uu)
        r[1] += sure + min(ug, (sure / su if su else 0) * uu)
        r[2] += ss + ug
        r[3] += val
        r[4] += ss
        r[5] = max(r[5], mx)
        r[6] += nu
    f = D / span
    return {i: dict(per_day=r[0] * f, low=r[1] * f, high=r[2] * f, avg=r[3] / r[4] if r[4] else None, top=r[5] or None,
                    new=r[6] * f, hours=span / 3600, pairs=len(pairs)) for i, r in acc.items() if r[2] > 0}


def latest_depth(con, realm):
    try:
        return {r[0]: dict(zip(('ts', 'auctions', 'units', 'min', 'median', 'u110', 'u125', 'u150', 'cost150', 'fresh', 'short', 'bids'), r[1:]))
                for r in con.execute('SELECT item_id, ts, auctions, units, min, median, u110, u125, u150, cost150, fresh, short, bids '
                                     'FROM depth d WHERE realm=? AND ts=(SELECT MAX(ts) FROM raw_scans WHERE realm=?)', (realm, realm))}
    except sqlite3.OperationalError:
        return {}


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=40)
    ap.add_argument('--days', type=float, default=3)
    a = ap.parse_args()
    import analyse
    cfg = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
    con = sqlite3.connect(os.path.join(HERE, 'ah.db'))
    con.executescript(SCHEMA)
    realm = cfg.get('realm') or cfg.get('ruleset') or 'eigene Scans'   # as ah/snapshot.py's house()
    now = con.execute('SELECT MAX(ts) FROM raw_scans WHERE realm=?', (realm,)).fetchone()[0]
    if not now:
        raise SystemExit('Keine Rohscans in ah.db: AuctionDB-Option "Record full scans" an, scannen, dann python ah/snapshot.py.')
    sold = sold_per_day(con, realm, now, a.days)
    dep = latest_depth(con, realm)
    de = json.load(open(os.path.join(HERE, 'data', 'names_de.json'), encoding='utf-8'))
    meta = {i: n for i, n in con.execute('SELECT item_id, name FROM item_meta')}
    name = lambda i: de.get(str(i)) or meta.get(i) or f'#{i}'
    scans = con.execute('SELECT ts, auctions FROM raw_scans WHERE realm=? ORDER BY ts', (realm,)).fetchall()
    pairs = con.execute('SELECT t0, t1 FROM sales WHERE realm=? AND t1 > ? GROUP BY t0, t1', (realm, now - a.days * D)).fetchall()
    print('Rohscans:', ', '.join(f'{datetime.fromtimestamp(t):%d.%m. %H:%M} ({n // 1000}k)' for t, n in scans))
    print('Gemessen:', ', '.join(f'{datetime.fromtimestamp(x):%d.%m. %H:%M}-{datetime.fromtimestamp(y):%H:%M}' for x, y in pairs) or '-')
    rows = sorted(sold.items(), key=lambda kv: -(kv[1]['per_day'] * (kv[1]['avg'] or 0)))
    print(f"\n{'Item':30} {'Verk./Tag':>9} {'(min-max)':>13} {'Ø Preis':>9} {'bis':>9} {'neu/Tag':>8} {'im AH':>7} {'Tiefst':>9} {'Reichw.':>8}")
    for i, s in rows[:a.top]:
        d = dep.get(i) or {}
        reach = d.get('units', 0) / s['per_day'] if s['per_day'] else None
        print(f"{name(i)[:30]:30} {s['per_day']:9.0f} {s['low']:6.0f}-{s['high']:<6.0f} {analyse.money(s['avg']):>9} {analyse.money(s['top']):>9} "
              f"{s['new']:8.0f} {d.get('units', 0):7} {analyse.money(d.get('min')):>9} {(f'{reach:.1f} T' if reach is not None else '-'):>8}")


if __name__ == '__main__':
    main()
