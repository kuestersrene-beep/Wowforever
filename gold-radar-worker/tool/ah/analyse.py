"""Phase 3: evaluates ah.db and writes a short, action-oriented report (Markdown + HTML chart).

    python ah/analyse.py                 (newest data, realm from config.json or the one with most data)
    python ah/analyse.py --realm "Realmname-Alliance"
"""
import argparse, html, json, math, os, sqlite3, statistics
from datetime import datetime, date

HERE = os.path.dirname(os.path.abspath(__file__))
PROF_DE = {'alchemy': 'Alchemie', 'blacksmithing': 'Schmiedekunst', 'enchanting': 'Verzauberkunst', 'engineering': 'Ingenieurskunst', 'leatherworking': 'Lederverarbeitung', 'tailoring': 'Schneiderei', 'cooking': 'Kochen', 'first-aid': 'Erste Hilfe'}
DATA = os.path.join(HERE, 'data')
# recipe items an engineer makes (Goblin or Gnomish specialisation only)
RECIPE_ITEM = ('Recipe:', 'Pattern:', 'Plans:', 'Schematic:', 'Formula:', 'Manual:')
H, D = 3600, 86400
BAND_PEAK_DAYS = {'1-20': (0, 7), '20-30': (3, 14), '30-40': (7, 28), '40-50': (14, 42), '50-60': (28, 90)}


def money(c):
    if c is None:
        return '–'
    c = int(round(c))
    g, rest = divmod(abs(c), 10000)
    s, cu = divmod(rest, 100)
    parts = [f'{g}g' if g else '', f'{s}s' if s else '', f'{cu}c' if cu and not g else '']
    return ('-' if c < 0 else '') + (' '.join(p for p in parts if p) or '0c')


def pct(a, b):
    return None if not a or not b else (b - a) / a


def fmt_pct(p):
    return '–' if p is None else f'{p:+.0%}'


def load_series(con, realm):
    """item -> sorted [(t, market, min, qty)] merged from Tradeskills' history ring and the saved readings."""
    s = {}
    for item, t, m, q in con.execute('SELECT item_id, t, market, quantity FROM history WHERE realm=?', (realm,)):
        s.setdefault(item, {})[t] = [m, None, q]
    for item, t, m, mn, q in con.execute('SELECT item_id, seen, market, min, quantity FROM scans WHERE realm=?', (realm,)):
        p = s.setdefault(item, {}).setdefault(t, [m, mn, q])
        p[1] = mn
    return {i: sorted((t, *v) for t, v in pts.items()) for i, pts in s.items()}


def at_or_before(series, t):
    best = None
    for p in series:
        if p[0] <= t:
            best = p
        else:
            break
    return best


def recent(ser, last):
    """(median of the last 24 h, that median / the median of the 1-3 days before, points used): readings with at
    least 5 listed; repeats of the same price and quantity count once, so one listing nobody buys sets no price.
    On a young realm the 7-day median still holds the launch prices: this is the price the market pays now."""
    pts = [p for p in ser if p[1] and (p[3] or 0) >= 5] or [p for p in ser if p[1]]
    pts = [p for k, p in enumerate(pts) if k == 0 or (p[1], p[3]) != (pts[k - 1][1], pts[k - 1][3])]
    day = [p[1] for p in pts if p[0] > last - D]
    before = [p[1] for p in pts if last - 3 * D <= p[0] <= last - D]
    ref = statistics.median(day) if len(day) >= 3 else None
    return ref, (ref / statistics.median(before) if ref and before else None), len(day) + len(before)


def price_level(ser, price, last):
    """(hours the cheapest price has stood at about today's level, median of the cheapest prices read in the 24 h
    before the newest reading). Market values and medians lag behind a falling market by days; the cheapest listing
    of every reading (own scans and the guild's shared ones) does not. A price that held over several readings for
    hours is the market, not a dip someone overlooked; a price that stepped down reading after reading is a falling
    market. Returns (hours at this level, cheapest price of the last reading an hour or more before, falling)."""
    lows = []
    for p in ser:   # one reading per half hour (a full scan is read in many small parts)
        if p[2] and p[0] >= last - D:
            if lows and p[0] - lows[-1][0] < 1800:
                lows[-1] = (p[0], p[2])
            else:
                lows.append((p[0], p[2]))
    since = last
    for t, lo in reversed(lows):
        if lo > 1.15 * price:
            break
        since = t
    prev = next((lo for t, lo in reversed(lows) if t <= last - H), None)
    tail = [lo for _, lo in lows[-3:]]
    falling = len(lows) >= 3 and all(b <= a for a, b in zip(tail, tail[1:])) and price < 0.7 * lows[0][1]
    return (last - since) / H, prev, falling


def newest_scan(rows):
    """When the newest real scan ended: the 200th most recent reading. Single items looked up in the AH afterwards
    (a few dozen readings) must not make the whole full scan before them look outdated."""
    seen = sorted((r['seen'] for r in rows), reverse=True)
    return seen[min(199, len(seen) - 1)] if seen else 0


def analyse(con, realm, cfg, now):
    items = json.load(open(os.path.join(DATA, 'items.json'), encoding='utf-8'))
    # Forever changed some vendor prices: what the game tooltip says beats the static Classic data
    fix_path = os.path.join(DATA, 'haendlerpreise.json')
    for k, v in (json.load(open(fix_path, encoding='utf-8')) if os.path.exists(fix_path) else {}).items():
        if not k.startswith('_') and isinstance(v, dict) and v.get('sell') is not None:
            items.setdefault(k, {'name': v.get('name') or k})['sell'] = v['sell']
    watch = json.load(open(os.path.join(DATA, 'watchlist.json'), encoding='utf-8'))
    recipes = json.load(open(os.path.join(DATA, 'recipes.json'), encoding='utf-8'))
    crates_path = os.path.join(DATA, 'crates.json')
    crates = json.load(open(crates_path, encoding='utf-8')) if os.path.exists(crates_path) else {}
    series = load_series(con, realm)
    try:  # latest TSM sales per item (ah/tsm.py), if any
        cols = {c[1] for c in con.execute('PRAGMA table_info(tsm)')}
        extra = ', avg_sale, historical' if 'avg_sale' in cols else ', NULL, NULL'
        tsm = {i: dict(sold=s, rate=rt, market=m, avg_sale=a, historical=h) for i, s, rt, m, a, h in con.execute(
            f'SELECT item_id, sold_per_day, sale_rate, market{extra} FROM tsm t WHERE realm=? AND t = '
            '(SELECT MAX(t) FROM tsm u WHERE u.realm=t.realm AND u.item_id=t.item_id)', (realm,))}
    except sqlite3.OperationalError:
        tsm = {}
    try:  # sales measured from AuctionDB's recorded full scans (ah/rawscan.py): single auctions bought between scans
        import rawscan
        measured, depth = rawscan.sold_per_day(con, realm, now), rawscan.latest_depth(con, realm)
        book, book_ts = rawscan.ladder(con, realm) if con.execute('SELECT 1 FROM raw_scans WHERE realm=? LIMIT 1', (realm,)).fetchone() else (None, None)
    except (ImportError, sqlite3.OperationalError):
        measured, depth, book, book_ts = {}, {}, None, None

    def vendor_take(r):
        """(units, profit) a buyer gets below 95 % of the vendor price: what the order book of the newest full scan
        holds there (one cheap auction among hundreds above the vendor price is no deal); without recorded full
        scans only the cheapest unit is sure."""
        if not (r['sell'] and r['price']) or r['stale']:
            return 0, 0
        lim = r['sell'] * 0.95
        steps = book.get(r['item'], []) if book is not None else [[r['price'], 1, 1]]
        units = sum(q for u, q, _ in steps if u <= lim)
        return units, sum((lim - u) * q for u, q, _ in steps if u <= lim)

    def vendor_doubt(r):
        """A real buy below the vendor price is cleared within hours: hundreds of units sitting below it over two
        scans 6+ hours apart mean the vendor price we know is wrong (Forever changed it), not that nobody noticed."""
        if not r['sell']:
            return False
        lim = r['sell'] * 0.95
        pts = [p for p in r['series'] if p[0] >= r['seen'] - D and p[3] is not None and p[3] >= 100
               and (p[2] or p[1]) and (p[2] or p[1]) <= lim]
        return len(pts) >= 2 and pts[-1][0] - pts[0][0] >= 6 * 3600
    try:  # names as the game client shows them (AuctionDB's item DB): for items the model's lists do not know
        meta = {i: n for i, n in con.execute('SELECT item_id, name FROM item_meta') if n}
    except sqlite3.OperationalError:
        meta = {}
    rows = {}
    for item, ser in series.items():
        last = ser[-1]
        price = last[2] or last[1]
        if not price:
            continue
        # a reading without quantity (prices shared by guild members) that is far off our own full reading of the last
        # 6 hours is one member's partial view: the own reading with quantities wins
        if last[3] is None:
            own = next((p for p in reversed(ser) if p[3] is not None and p[0] >= last[0] - 6 * 3600 and (p[2] or p[1])), None)
            if own and not 1 / 1.5 <= price / (own[2] or own[1]) <= 1.5:
                price = own[2] or own[1]
        # 7-day reference: scans with at least 5 listed, so a few lone listings cannot set the "normal" price;
        # thin markets (never 5 listed) fall back to all points
        week = [p[1] for p in ser if p[0] >= now - 7 * D and p[1] and (p[3] or 0) >= 5] \
            or [p[1] for p in ser if p[0] >= now - 7 * D and p[1]]
        r = dict(item=item, name=items.get(str(item), {}).get('name') or meta.get(item) or f'#{item}', de=meta.get(item), price=price, market=last[1],
                 # quantity: the newest reading that has one (TSM points carry none), at most a day older
                 qty=next((p[3] for p in reversed(ser) if p[3] is not None and p[0] >= last[0] - D), None), seen=last[0], median7=statistics.median(week) if week else None,
                 vol=(statistics.pstdev(week) / statistics.mean(week)) if len(week) > 2 else None,
                 sell=items.get(str(item), {}).get('sell'), w=watch.get(str(item), {}), crate=crates.get(str(item)), series=ser)
        for label, back in (('d1', D), ('d3', 3 * D), ('d7', 7 * D)):
            old = at_or_before(ser, last[0] - back)
            r['p_' + label] = pct(old[1], last[1]) if old else None
            r['q_' + label] = pct(old[3], last[3]) if old and old[3] else None
        # sales proxy: listed quantity that disappeared between readings, per day
        gone, span = 0, 0
        for a, b in zip(ser, ser[1:]):
            if a[0] >= now - 3 * D and a[3] is not None and b[3] is not None:
                gone += max(0, a[3] - b[3])
                span += b[0] - a[0]
        r['gone_per_day'] = gone / (span / D) if span >= 6 * H else None
        # where our own readings can't measure sell-through (daily add-on data), TSM's sold per day stands in
        r['tsm'] = tsm.get(item)
        r['tsm_sold'] = r['tsm']['sold'] if r['tsm'] else None
        if r['tsm_sold'] is not None and (r['gone_per_day'] is None or cfg.get('tsm_abverkauf_vorrang')):
            r['gone_per_day'] = r['tsm_sold']
        # measured sales beat both: the proxy misses every sale that new listings hide, TSM is another game's data
        r['sold_raw'], r['depth'] = measured.get(item), depth.get(item)
        if r['sold_raw']:
            r['gone_per_day'] = r['sold_raw']['per_day']
        elif measured and r['depth']:   # measured intervals, listed, but nothing of it bought
            r['gone_per_day'] = 0.0
        r['ref24'], r['trend'], r['ref_points'] = recent(ser, last[0])
        r['hold_h'], r['low_prev'], r['stairs'] = price_level(ser, price, last[0])
        # conservative "what it sells for now": lowest of the 24-h median, the 7-day median and the measured paid price
        # paid: the median paid per unit (robust against one dear sale), the average where no median is measured yet
        paid = (r['sold_raw'] or {}).get('med') or (r['sold_raw'] or {}).get('avg')
        r['ref'] = min([v for v in (r['ref24'], r['median7'], paid) if v] or [price])
        rows[item] = r
    # a price only counts while the item is listed: missing from the newest scan (older readings) or fewer than 3
    # listed is no market price, so no factor, profit or tip is built on it
    newest = newest_scan(rows.values())
    for r in rows.values():
        r['stale'] = r['seen'] < newest - 2 * H or (r['qty'] is not None and r['qty'] < 3)

    def price_of(i, units=1):
        """What `units` of a reagent cost per unit: the AH walked up its order book (the cheapest auction alone is
        often a single unit), or the vendor when a vendor sells it for less; without a recorded full scan the
        cheapest listing."""
        r, vend = rows.get(i), cfg['vendor_kosten'].get(str(i))
        ah = None
        if r and not r['stale']:
            ah = book_unit(i, units) or r['price']
        cands = [p for p in (ah, vend) if p]
        return min(cands) if cands else None

    def book_unit(i, units):
        steps = book.get(i) if book else None
        # only when the full scan is as new as the item's price: a newer reading (Tradeskills, guild) beats an old book
        if not steps or not book_ts or book_ts < rows[i]['seen'] - 2 * H:
            return None
        left, cost = units, 0
        for u, q, _ in steps:
            take = min(left, q)
            cost, left = cost + take * u, left - take
            if left <= 0:
                break
        if left > 0:   # more than the book holds: the rest at its dearest step
            cost += left * steps[-1][0]
        return cost / units

    fee = cfg.get('ah_gebuehr', 0.05)
    batch = cfg.get('craft_serie', 5)                 # crafts in a row: reagents are bought for that many
    share = cfg.get('flip_marktanteil', 0.15)         # what one seller can take of the measured daily purchases
    dep_rate = cfg.get('einstellgebuehr', 0.15)       # deposit per listing as a share of the vendor price
    cooldown = {int(k): v for k, v in (cfg.get('abklingzeit_tage') or {}).items() if not str(k).startswith('_')}
    crafts = []
    for rc in recipes:
        if cfg['meine_berufe'] and rc['prof'] not in cfg['meine_berufe']:
            continue
        prod = rows.get(rc['item_id'])
        # a product with no current listing has no price, one nobody buys (measured) brings no revenue
        if not prod or prod['stale'] or (prod['gone_per_day'] is not None and prod['gone_per_day'] < 1):
            continue
        costs = [price_of(i, n * batch) for i, n in rc['reagents']]
        if any(c is None for c in costs):
            continue
        cost = sum(c * n for c, (_, n) in zip(costs, rc['reagents'])) / rc['count']
        avg_sale = (prod['tsm'] or {}).get('avg_sale')
        price = min(p for p in (prod['price'], prod['ref'], avg_sale) if p)   # one fantasy listing is no revenue
        revenue = price * (1 - fee)
        # deposit risk: a listing that does not sell loses its deposit (gear with a high vendor price: tens of silver).
        # Buyers clear the cheapest auctions first, so an undercut listing sells when the next buyer comes: chance of
        # one within the 12-h listing at the measured rate, times 0.7 for being undercut in between
        sold = prod['gone_per_day']
        p_sell = 1.0 if sold is None else max(0.1, 0.7 * (1 - math.exp(-sold * 0.5)))
        deposit = dep_rate * (prod['sell'] or 0) * (1 / p_sell - 1)
        revenue -= deposit
        if cost > 0 and (revenue - cost) / cost >= cfg['min_craft_marge']:
            cd = cooldown.get(rc['item_id']) if rc['prof'] in ('alchemy', 'tailoring', 'leatherworking') else None
            # gold a day: a cooldown craft once per cooldown, others the seller's share of the measured purchases
            units = (rc['count'] / cd) if cd else (max(share * sold, 1) if sold is not None else 1)
            crafts.append(dict(prof=rc['prof'], item_id=rc['item_id'], name=prod['name'], cost=cost, revenue=revenue,
                               margin=(revenue - cost) / cost, profit=revenue - cost, qty=prod['qty'], learn=rc['learn'],
                               sold=sold, capped=price < prod['price'], deposit=deposit, cd=cd, fall=prod['p_d1'],
                               cover=(prod['qty'] or 0) / sold if sold else None,
                               per_day=(revenue - cost) * units, spec=prod['name'].startswith(RECIPE_ITEM)))
    crafts.sort(key=lambda c: -c['per_day'])

    days = (date.fromtimestamp(now) - date.fromisoformat(cfg['launch'])).days
    sig = {k: [] for k in ('akku', 'unter', 'heiss', 'vendor', 'squeeze', 'welle')}
    try:  # goods any vendor sells without limit: their AH price swings mean nothing, so no market signals for them
        vendor_goods = set(json.load(open(os.path.join(os.path.dirname(HERE), 'vendor_items.json'), encoding='utf-8')))
    except OSError:
        vendor_goods = set()
    first_aid = {rc['item_id'] for rc in recipes if rc['prof'] == 'first-aid'}

    def paid_ok(r):
        """The price is one buyers pay: a reseller who bought out the cheap supply and relisted it at 5-200x sets a
        price nobody has paid yet (no hold or sell tip on it). With measured sales the dearest paid level (90th
        percentile of an interval) must reach 2/3 of the price, without them the price is at most 4x the 7-day median."""
        m = r['sold_raw'] or {}
        if m.get('top'):
            return r['price'] <= 1.5 * m['top']
        base = r['median7'] or r['ref']
        return not base or r['price'] <= 4 * base
    for r in rows.values():
        p3, q3 = r['p_d3'], r['q_d3']
        if r['item'] in first_aid:   # bandages: nearly everyone makes their own
            continue
        # worth the trip only from 20s total profit on, counted over the auctions that really sit below the limit
        r['v_units'], r['v_profit'] = vendor_take(r)
        r['v_doubt'] = vendor_doubt(r)
        if r['name'] in vendor_goods:
            if r['v_profit'] >= 2000 and not r['v_doubt']:
                sig['vendor'].append(r)
            continue
        real = not r['stale'] and (r['qty'] or 0) >= 5 and r['price'] * (r['qty'] or 0) >= 10000   # at least 1g listed
        r['reset'] = not paid_ok(r)
        real = real and not r['reset']
        # rising over 3 days with shrinking stock, but not if it is crashing today (a hold tip in a falling market)
        if real and p3 is not None and q3 is not None and p3 > 0.10 and q3 < -0.20 and (r['p_d1'] or 0) > -0.2:
            sig['akku'].append(r)
        band = r['w'].get('band')
        if r['w'].get('score', 0) >= 40 and band in BAND_PEAK_DAYS:
            start = BAND_PEAK_DAYS[band][0]
            end = r['w'].get('end')
            # not while it crashes today, and not when measured sales say nobody buys it (a buy tip needs buyers later
            # and a price that holds now)
            if 3 <= start - days <= 10 and (p3 is None or p3 < 0.05) and real and (r['trend'] is None or r['trend'] >= 0.85) \
                    and (end is None or end >= 1) and r['price'] <= r['ref'] * 1.05 and (r['p_d1'] or 0) > -0.2 \
                    and not (measured and r['gone_per_day'] == 0):
                sig['unter'].append(r)
        base = r['ref24'] or r['median7']
        if real and base and r['price'] > 2 * base and (r['q_d1'] or 0) > 0:
            sig['heiss'].append(r)
        # squeeze: the market sells more per day than is listed, the rest is about to be bought out
        # with measured sales: bought faster than restocked (new listings include reposts, so they overstate the
        # supply; the sure sales alone, without possible reposts, must outrun it: a market where hundreds a day are
        # bought and as many listed again is deep, not drying up), the listed quantity fell by a fifth in a day, and
        # what is left lasts less than half a day
        m = r['sold_raw']
        if m and r['qty'] and r not in sig['heiss'] and not r['stale']:
            if m['low'] > m['new'] and (r['q_d1'] or 0) < -0.2 and r['qty'] < 0.5 * m['per_day'] and m['per_day'] * r['price'] >= 5000                     and r['qty'] * r['price'] >= 10000:
                sig['squeeze'].append(r)
        elif r['gone_per_day'] and r['qty'] and r['gone_per_day'] >= r['qty'] and r not in sig['heiss'] and r['qty'] * r['price'] >= 10000                 and not r['stale']:
            sig['squeeze'].append(r)
        if r['v_profit'] >= 2000 and not r['v_doubt']:
            sig['vendor'].append(r)
    by_band = {}
    for r in rows.values():
        if r['w'].get('band') and (r['p_d3'] or 0) > 0.15:
            by_band.setdefault(r['w']['band'], []).append(r)
    sig['welle'] = {b: v for b, v in by_band.items() if len(v) >= 3}
    # crate and writ items first: their buyers come back with every crate, not only with the levelling wave
    sig['squeeze'].sort(key=lambda r: (not r['crate'], -r['gone_per_day'] / max(r['qty'], 1)))
    return rows, crafts, sig, days


def todo_items(rows, crafts, sig, cfg):
    """Today's actions as data (the dashboard draws cards from them): kind, item, the one price that matters
    (limit with its label) and the reason. Kinds: haendler, kaufen, halten, verkaufen, craften."""
    acts = []
    # one card per item: overheated (sell) beats a squeeze (buy) beats accumulation (hold), so no item gets two
    # contradicting orders in a row
    hot = {r['item'] for r in sig['heiss'][:2]}
    squeeze = [r for r in sig['squeeze'] if r['item'] not in hot][:2]
    taken = hot | {r['item'] for r in squeeze}
    for r in sorted(sig['vendor'], key=lambda r: -r['v_profit'])[:3]:
        acts.append(dict(kind='haendler', id=r['item'], name=r['name'], qty=r['v_units'], qty_label='Stück unter der Grenze',
                         limit=round(r['sell'] * 0.95), limit_label='Kaufen bis',
                         why=f"Buyout ab {money(r['price'])} < Händlerpreis {money(r['sell'])}: {r['v_units']} Stück darunter, "
                             f"zusammen ca. {money(r['v_profit'])} Gewinn"))
    for r in sorted(sig['unter'], key=lambda r: -r['w']['score'])[:3]:
        acts.append(dict(kind='kaufen', id=r['item'], name=r['name'], limit=round(r['ref'] * 1.05), limit_label='Kaufen bis',
                         why=f"Die Spieler für Levelband {r['w']['band']} kommen erst noch, der Preis fällt nicht mehr"
                             + (f" (24 Std. {fmt_pct(r['trend'] - 1)})" if r['trend'] is not None else '')
                             + (f", am Ende des Fensters knapp ({r['w']['end']:.1f})" if r['w'].get('end') else '')))
    for r in sorted((r for r in sig['akku'] if r['item'] not in taken), key=lambda r: -(r['p_d3'] or 0))[:2]:
        acts.append(dict(kind='halten', id=r['item'], name=r['name'], limit=round(r['price']), limit_label='Nicht unter',
                         why=f"Preis {fmt_pct(r['p_d3'])}, Menge {fmt_pct(r['q_d3'])} in 3 Tagen: Angebot wird knapp"))
    for r in squeeze:
        crate = r['crate']
        acts.append(dict(kind='kaufen', id=r['item'], name=r['name'], qty=r['qty'], limit=round(r['ref'] * 1.25),
                         limit_label='Kaufen bis',
                         why=f"Leerkauf droht: ca. {r['gone_per_day']:.0f} Stück/Tag {'gekauft (gemessen)' if r['sold_raw'] else 'verkauft'}, nur {r['qty']} im AH"
                             + (f", Nachschub ca. {r['sold_raw']['new']:.0f}/Tag" if r['sold_raw'] else '')
                             + (f"; steckt in Merchant's-Favor-Crates ({crate})" if crate else '') + '. Restbestand abgreifen, teurer neu einstellen'))
    for r in sig['heiss'][:2]:
        base = r['ref24'] or r['median7']
        acts.append(dict(kind='verkaufen', id=r['item'], name=r['name'], limit=round(base * 1.5), limit_label='Mindestens',
                         why=f"Preis {money(r['price'])} ist mehr als doppelt so hoch wie {'der Median der letzten 24 Std.' if r['ref24'] else 'der 7-Tage-Median'} {money(base)}, Menge steigt wieder"))
    # the first weeks: no endgame recipes (skill 275+) in the daily list; the full list stays in its own tab
    # no craft tip for a product whose price fell by a quarter in a day (the profit may be gone before it sells) or
    # whose listed stock alone covers more than 3 days of measured purchases (the new craft waits behind all of it)
    for c in [c for c in crafts if (c['learn'] or 0) < 275 and not c.get('spec') and not (c.get('fall') or 0) < -0.25
              and not (c.get('cover') or 0) > 3][:3]:
        acts.append(dict(kind='craften', id=c.get('item_id'), name=c['name'], prof=PROF_DE.get(c['prof'], c['prof']), skill=c['learn'],
                         cost=round(c['cost']), revenue=round(c['revenue']), margin=c['margin'], limit=round(c['revenue'] - c['cost']),
                         limit_label='Gewinn', why=f"Kosten {money(c['cost'])} (Zutaten für {cfg.get('craft_serie', 5)} Crafts aus dem Orderbuch), "
                             f"Erlös nach Gebühr{' und Einstellrisiko' if c.get('deposit') else ''} {money(c['revenue'])} (+{c['margin']:.0%}), "
                             f"ca. {money(c['per_day'])} am Tag" + (f" (Abklingzeit {c['cd']} Tage)" if c.get('cd') else '')))
    for a in acts:   # the name as the (German) game client shows it, for the page
        a['de'] = (rows.get(a['id']) or {}).get('de') if a.get('id') else None
    return acts[:10]


def todo_text(a):
    """(what, why) for the Markdown report."""
    n, lim = f"**{a['name']}**", money(a['limit'])
    what = {'haendler': f"{n} die {a.get('qty')} Stück bis {lim} kaufen und an den Händler verkaufen",
            'kaufen': f"{n} kaufen bis max. {lim}",
            'halten': f"{n} halten bzw. nicht unter {lim} verkaufen",
            'verkaufen': f"{n} jetzt verkaufen, mindestens {lim}",
            'craften': f"{n} craften ({a.get('prof')}, Skill {a.get('skill')})"}[a['kind']]
    return what, a['why']


def todo(rows, crafts, sig, cfg):
    return [todo_text(a) for a in todo_items(rows, crafts, sig, cfg)]


def sparkline(points, w=260, h=50, color='#2f6fdf'):
    pts = [(t, v) for t, v in points if v]
    if len(pts) < 2:
        return '<span class="muted">zu wenig Daten</span>'
    t0, t1 = pts[0][0], pts[-1][0]
    lo, hi = min(v for _, v in pts), max(v for _, v in pts)
    sx = lambda t: 2 + (w - 4) * (t - t0) / ((t1 - t0) or 1)
    sy = lambda v: h - 3 - (h - 6) * (v - lo) / ((hi - lo) or 1)
    d = ' '.join(f'{sx(t):.1f},{sy(v):.1f}' for t, v in pts)
    return f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}"><polyline fill="none" stroke="{color}" stroke-width="2" points="{d}"/></svg>'


def write_html(path, realm, rows, now):
    top = sorted((r for r in rows.values() if r['w']), key=lambda r: -r['w']['score'])[:10]
    cards = []
    for r in top:
        cards.append(f"""<div class="card"><h3>{html.escape(r['name'])}</h3>
<div class="meta">Score {r['w']['score']} · Band {r['w']['band']} · jetzt {money(r['price'])} · 3 Tage {fmt_pct(r['p_d3'])}</div>
<div class="lbl">Preis</div>{sparkline([(p[0], p[1]) for p in r['series']])}
<div class="lbl">Menge im AH</div>{sparkline([(p[0], p[3]) for p in r['series']], color='#c47a1c')}</div>""")
    doc = f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AH-Kurven</title><style>
:root{{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#6b6b66;--card:#fff;--line:#e3e2dc}}
@media (prefers-color-scheme:dark){{:root{{--bg:#161615;--fg:#ecebe6;--muted:#9a9993;--card:#21211f;--line:#34332f}}}}
body{{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}}
h1{{font-size:20px;margin:0 0 4px}} .muted,.meta,.lbl{{color:var(--muted);font-size:13px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;margin-top:16px}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}} h3{{margin:0 0 2px;font-size:15px}}
svg{{max-width:100%;display:block}}</style></head><body>
<h1>Top-10 der Watchlist: Preis und Menge</h1><div class="muted">{html.escape(realm)} · Stand {datetime.fromtimestamp(now):%d.%m.%Y %H:%M}</div>
<div class="grid">{''.join(cards) or '<p>Noch keine Watchlist-Items in den Scans.</p>'}</div></body></html>"""
    open(path, 'w', encoding='utf-8').write(doc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--realm')
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
    con = sqlite3.connect(os.path.join(HERE, 'ah.db'))
    realms = con.execute('SELECT realm, COUNT(*) FROM scans GROUP BY realm ORDER BY 2 DESC').fetchall()
    if not realms:
        raise SystemExit('ah.db ist leer: zuerst python ah/snapshot.py ausführen.')
    realm = a.realm or cfg.get('realm') or realms[0][0]
    now = con.execute('SELECT MAX(seen) FROM scans WHERE realm=?', (realm,)).fetchone()[0]
    rows, crafts, sig, days = analyse(con, realm, cfg, now)
    n_scans = con.execute('SELECT COUNT(DISTINCT seen) FROM scans WHERE realm=?', (realm,)).fetchone()[0]

    out = os.path.join(HERE, 'reports')
    os.makedirs(out, exist_ok=True)
    stamp = datetime.fromtimestamp(now).strftime('%Y-%m-%d_%H%M')
    L = [f'# AH-Report {realm}', '',
         f'Stand {datetime.fromtimestamp(now):%d.%m.%Y %H:%M} · Tag {days} nach Launch · {len(rows)} Items · {n_scans} Scan-Zeitpunkte', '']
    if n_scans < 3:
        L += ['> Wenig Historie: Trends werden erst nach ein paar Scans an verschiedenen Tagen aussagekräftig.', '']
    L += ['## Heute tun', '']
    acts = todo(rows, crafts, sig, cfg)
    for i, (what, why) in enumerate(acts, 1):
        L.append(f'{i}. {what}. {why}.')
    if not acts:
        L.append('Keine klaren Signale.')

    def table(title, rs, cols):
        L.extend(['', f'## {title}', ''])
        if not rs:
            L.append('–')
            return
        L.append('| ' + ' | '.join(c[0] for c in cols) + ' |')
        L.append('|' + '---|' * len(cols))
        for r in rs:
            L.append('| ' + ' | '.join(str(c[1](r)) for c in cols) + ' |')

    base_cols = [('Item', lambda r: r['name']), ('Preis', lambda r: money(r['price'])), ('Menge', lambda r: r['qty']),
                 ('24h', lambda r: fmt_pct(r['p_d1'])), ('3 Tage', lambda r: fmt_pct(r['p_d3'])),
                 ('7 Tage', lambda r: fmt_pct(r['p_d7'])), ('Menge 3T', lambda r: fmt_pct(r['q_d3'])),
                 ('Abverkauf/Tag', lambda r: '–' if r['gone_per_day'] is None else round(r['gone_per_day'])),
                 ('Score', lambda r: r['w'].get('score', ''))]
    wl = sorted((r for r in rows.values() if r['w']), key=lambda r: -r['w']['score'])
    table('Watchlist (Top 30 nach Score)', wl[:30], base_cols)
    table('Einlagern: Preis steigt, Menge fällt', sig['akku'], base_cols)
    table('Unterbewertet: hoher Score, flacher Preis, Spitzennachfrage kommt noch', sig['unter'], base_cols)
    table('Überhitzt: über 2x 7-Tage-Median, Angebot kommt nach', sig['heiss'], base_cols)
    table('Leerkauf droht: pro Tag wird mehr verkauft als im AH liegt', sig['squeeze'], base_cols)
    table('Vendor-Flip: Buyout unter Händlerpreis', sig['vendor'][:20],
          [('Item', lambda r: r['name']), ('Buyout', lambda r: money(r['price'])),
           ('Händler zahlt', lambda r: money(r['sell'])), ('Stück unter der Grenze', lambda r: r['v_units']),
           ('Gewinn', lambda r: money(r['v_profit']))])
    table(f"Craft-Arbitrage (Marge ≥ {cfg['min_craft_marge']:.0%}, {', '.join(cfg['meine_berufe']) or 'alle Berufe'})",
          crafts[:25], [('Item', lambda c: c['name']), ('Beruf', lambda c: c['prof']), ('Skill', lambda c: c['learn']),
                        ('Kosten', lambda c: money(c['cost'])), ('Erlös netto', lambda c: money(c['revenue'])),
                        ('Gewinn', lambda c: money(c['profit'])), ('Marge', lambda c: f"{c['margin']:.0%}"),
                        ('im AH', lambda c: c['qty'])])
    L.extend(['', '## Welle läuft an', ''])
    if sig['welle']:
        for band, rs in sig['welle'].items():
            L.append(f"- Levelband {band}: {', '.join(r['name'] for r in rs[:8])} steigen gleichzeitig (+15 % in 3 Tagen)")
    else:
        L.append('–')
    L.extend(['', 'Hinweis: Vendor-Kosten in config.json sind Schätzwerte. Abverkauf/Tag = verschwundene Menge zwischen '
              'Scans (enthält auch abgelaufene oder zurückgezogene Auktionen).'])
    md = os.path.join(out, f'report_{stamp}.md')
    open(md, 'w', encoding='utf-8').write('\n'.join(L))
    hp = os.path.join(out, f'kurven_{stamp}.html')
    write_html(hp, realm, rows, now)
    print(md)
    print(hp)


if __name__ == '__main__':
    main()
