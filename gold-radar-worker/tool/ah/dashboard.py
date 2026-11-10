"""Builds dashboard.html: profit list from the fresh-realm demand/supply model (windows computed per viewer profile
in the page), item icons and tooltips, refining candidates, limited vendor recipes and live AH signals.

    python ah/dashboard.py            -> dashboard.html (with your own scan data, if any)
    python ah/dashboard.py --teilen   -> dashboard-teilen.html (model only, to give to guild mates)
"""
import base64, json, os, sqlite3, sys
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import analyse
from snapshot import SCHEMA


try:  # cooldown goods (annahmen.json); the website worker has no tools/ folder and does not need them
    COOLDOWN = {k: v for k, v in json.load(open(os.path.join(ROOT, 'tools', 'annahmen.json'), encoding='utf-8')).get('cooldown_ware', {}).items()
                if not k.startswith('_')}
except OSError:
    COOLDOWN = {}


def load(name):
    return json.load(open(os.path.join(ROOT, name), encoding='utf-8'))


def analysed(con, realm, cfg, now):
    rows, crafts, sig, days = analyse.analyse(con, realm, cfg, now)
    n_scans = con.execute('SELECT COUNT(*) FROM (SELECT t FROM history WHERE realm=? UNION SELECT seen FROM scans WHERE realm=?)',
                          (realm, realm)).fetchone()[0]
    flags = {}
    for key, label in (('akku', 'Einlagern'), ('unter', 'Unterbewertet'), ('heiss', 'Überhitzt'), ('squeeze', 'Leerkauf droht'),
                       ('vendor', 'Vendor-Flip')):
        for r in sig[key]:
            flags.setdefault(r['item'], []).append(label)
    try:  # order book and market value line from the recorded full scans (ah/rawscan.py), if there are any
        import rawscan
        book, book_ts = rawscan.ladder(con, realm)
        mv = rawscan.market_series(con, realm, now)
    except Exception as e:
        print(f'Rohscans: Orderbuch nicht gebaut ({e})')
        book, book_ts, mv = {}, None, {}
    return dict(realm=realm, now=now, days=days, n_scans=n_scans, rows=rows, crafts=crafts, flags=flags,
                todo=analyse.todo_items(rows, crafts, sig, cfg), book=book, book_ts=book_ts, mv=mv, best=bestsellers(con, rows))


# item classes as AuctionDB stores them (classic class ids) -> the page's category filter
CLASS_DE = {0: 'Verbrauchbar', 1: 'Behälter', 2: 'Waffe', 3: 'Edelstein', 4: 'Rüstung', 5: 'Reagenz', 6: 'Projektil',
            7: 'Handwerkswaren', 9: 'Rezept', 11: 'Köcher', 12: 'Quest', 13: 'Schlüssel', 15: 'Verschiedenes'}


def bestsellers(con, rows):
    """Every item with sales measured from the recorded full scans (ah/rawscan.py), any item, not only the model's:
    bought per day, gold per day at the average paid price, restock, how long the listed stock lasts."""
    try:
        meta = {i: (n, c) for i, n, c in con.execute('SELECT item_id, name, class FROM item_meta')}
    except sqlite3.OperationalError:
        meta = {}
    out = []
    for iid, r in rows.items():
        m, dp = r.get('sold_raw'), r.get('depth') or {}
        if not m or not m.get('avg') or m['per_day'] < 0.5:
            continue
        name, cls = meta.get(iid, (None, None))
        units = dp.get('units', r.get('qty'))
        # a few dear sales (random-suffix gear shares one item id) must not set the gold per day: above 3x the
        # cheapest listing the paid average is capped at the median of what is listed now
        out_avg = m['avg'] > 3 * r['price']
        gold_price = min(m['avg'], max(r['price'], dp.get('median') or 3 * r['price'])) if out_avg else m['avg']
        out.append(dict(id=iid, name=name or r['name'], en=r['name'], cat=CLASS_DE.get(cls, 'ohne Angabe'),
                        d=round(m['per_day'], 1), lo=round(m['low'], 1), hi=round(m['high'], 1), avg=round(m['avg']), top=m['top'],
                        new=round(m['new'], 1), gold=round(m['per_day'] * gold_price), out=out_avg, u=units, lp=r['price'], h=round(m['hours'], 1),
                        reach=round(24 * units / m['per_day'], 1) if units is not None and m['per_day'] else None))
    out.sort(key=lambda b: -b['gold'])
    return out


def live_data(cfg):
    db = os.path.join(HERE, 'ah.db')
    if not os.path.exists(db):
        return None
    con = sqlite3.connect(db)
    realms = con.execute('SELECT realm, COUNT(*) FROM scans GROUP BY realm ORDER BY 2 DESC').fetchall()
    if not realms:
        return None
    realm = cfg.get('realm') or realms[0][0]
    now = con.execute('SELECT MAX(seen) FROM scans WHERE realm=?', (realm,)).fetchone()[0]
    return analysed(con, realm, cfg, now)


def flips(live, cfg):
    """AH flip score from live scans (any item, mass goods included, vendor goods excluded):
    (profit per day)^0.35 x margin x safety near the vendor floor x confidence.
    Target = the lowest of: median of the last 24 h, 7-day median, average price actually paid (measured raw scans).
    On a young realm the 7-day median still holds the launch prices; a price that stood unchanged with an unchanged
    quantity over several scans (one seller nobody buys from) counts once. Markets whose 24-h median is clearly below
    the day(s) before are falling, not dipping, and are left out (vendor-floor buys excepted).
    profit per day = (target after fee - price) x units you can flip per day: a share of the measured sales
    (flip_marktanteil), at most what is listed up to the buy limit."""
    fee = cfg.get('ah_gebuehr', 0.05)
    min_unit, min_day = cfg.get('flip_min_gewinn_stueck', 20), cfg.get('flip_min_gewinn_tag', 2000)
    share, fall = cfg.get('flip_marktanteil', 0.15), cfg.get('flip_trend_grenze', 0.85)
    vendor_goods = set(load('vendor_items.json'))
    vendor_ids = {int(k) for k in cfg['vendor_kosten'] if not k.startswith('_')}
    out = []
    for iid, r in live['rows'].items():
        if iid in vendor_ids or r['name'] in vendor_goods:
            continue
        price, vendor, qty = r['price'], r['sell'], r['qty'] or 0
        if not qty and r.get('tsm_sold'):  # no AH quantity (TSM data): about two days of sales
            qty = max(1, round(2 * r['tsm_sold']))
        if not price or not qty or r.get('stale'):
            continue
        ref24, trend, points = r['ref24'], r['trend'], r['ref_points']   # analyse.recent(): the price of the last 24 h
        paid = (r.get('sold_raw') or {}).get('avg')
        cands = [(v, src) for v, src in ((ref24, '24-Std.-Median'), (r['median7'] or r['market'], '7-Tage-Median'),
                                         (paid, 'Ø bezahlt')) if v]
        if not cands:
            continue
        target, target_src = min(cands)
        net = target * (1 - fee)
        below_vendor = bool(vendor) and price < vendor * 0.95
        falling = trend is not None and trend < fall
        if falling and not below_vendor:
            continue
        unit = max(net - price, (vendor - price) if below_vendor else 0)
        margin = (price + unit) / price
        buy_max = (price + unit) / 1.15 if below_vendor and unit > net - price else net / 1.15
        # units you can buy up to the limit (order book of the newest full scan), else everything listed
        d = r.get('depth')
        if d and d.get('min'):
            lim = buy_max / d['min']
            buyable = 0 if lim < 1 else d['u110'] if lim < 1.25 else d['u125'] if lim < 1.5 else d['u150']
        else:
            buyable = qty
        liq = r['gone_per_day']
        # measured sales: your share of them, at least one sale a day; under one sale a day it is luck, not trade;
        # unknown: 1 a day
        units = min(max(share * liq, 1) if liq is not None and liq >= 1 else (1 if liq is None else 0), buyable or 0)
        per_day = unit * units
        if unit < min_unit or per_day < min_day or (margin < 1.15 and not below_vendor):
            continue
        floor = price / vendor if vendor else None          # 1.0 = price equals what the vendor pays
        safety = 3.0 if below_vendor else (1.0 + 2.0 * max(0.0, (1.3 - floor) / 1.3) if floor else 1.0)
        conf = min(1.0, qty / 20) * min(1.0, points / 4) * (1.0 if trend is not None else 0.6)
        score = (per_day ** cfg.get('flip_exponent', 0.35)) * margin * safety * conf
        note = []
        if qty < 10:
            note.append('dünner Markt')
        if points < 4:
            note.append('wenig Messpunkte')
        if trend is None:
            note.append('Trend unbekannt')
        elif falling:
            note.append(f'Markt fällt ({round((trend - 1) * 100)} % in 24 Std.), nur wegen Händlerpreis drin')
        out.append(dict(id=iid, name=r['name'], de=r.get('de'), price=price, target=target, target_src=target_src, ref24=ref24,
                        med7=r['median7'], paid=paid, trend=trend, margin=margin, vendor=vendor, floor=floor,
                        qty=qty, liq=liq, units=units, unit=unit, per_day=per_day, conf=conf, score=score,
                        below_vendor=below_vendor, buy_max=buy_max, note=', '.join(note)))
    out.sort(key=lambda x: -x['score'])
    return out[:150]


TIERS = ['Apprentice', 'Journeyman', 'Expert', 'Artisan']


def favor_index(live, fills):
    """Silver per crate fill: every fill option of a Merchant's Favor crate tier priced at the current buyout.
    The cheapest fill draws the crowd; its price has room up to the fill cost of the second cheapest."""
    out = []
    for tier in TIERS:
        rows = []
        for iid, name, count in fills.get(tier, []):
            lr = live['rows'].get(iid)
            if lr and lr['price'] and (lr['qty'] is None or lr['qty'] >= count):   # a full fill on the AH (unknown: TSM)
                rows.append(dict(tier=tier, id=iid, name=name, count=count, price=lr['price'], qty=lr['qty'],
                                 med7=lr['median7'], cost=lr['price'] * count))
        rows.sort(key=lambda r: r['cost'])
        for k, r in enumerate(rows):
            r['rank'] = k + 1
            r['rel'] = r['cost'] / rows[0]['cost']
        if len(rows) >= 2:
            rows[0]['room'] = rows[1]['cost'] / rows[0]['count']   # unit price at which it costs as much as the 2nd fill
            rows[0]['gap'] = rows[1]['cost'] / rows[0]['cost']
        out += rows
    return out


def live_payload(con, realm, cfg, ctx):
    """Live part of the page from a scan database; ctx = the page's own DATA.ctx (used by the website's worker,
    which merges the members' uploaded scans and puts this into the shared page)."""
    now = max(con.execute('SELECT MAX(seen) FROM scans WHERE realm=?', (realm,)).fetchone()[0] or 0,
              con.execute('SELECT MAX(t) FROM history WHERE realm=?', (realm,)).fetchone()[0] or 0)
    if not now:
        return None
    fills = {tier: [tuple(f) for f in v] for tier, v in ctx['fills'].items()}
    out = pack(analysed(con, realm, cfg, now), cfg, set(ctx['wanted']), fills)
    if out:
        out['sources'] = sources_of(con, realm)
    return out


def sources_of(con, realm):
    """What the live prices come from and how old: own/member scans (Tradeskills, AuctionDB, Auctionator, aux) and
    TradeSkillMaster public data. The website's worker adds the Blizzard API entry."""
    out = []
    n, items, last = con.execute('SELECT COUNT(DISTINCT seen), COUNT(DISTINCT item_id), MAX(seen) FROM scans WHERE realm=?', (realm,)).fetchone()
    hist = con.execute('SELECT MAX(t) FROM history WHERE realm=?', (realm,)).fetchone()[0]
    if last or hist:
        out.append(dict(id='scans', name='Scans (Addon-Dateien)', t=max(last or 0, hist or 0), items=items, points=n,
                        note='Tiefstpreis und Menge aus Auktionshaus-Addons (AuctionDB, Auctionator, aux, Tradeskills).'))
    try:
        d, titems, t = con.execute('SELECT COUNT(DISTINCT t), COUNT(DISTINCT item_id), MAX(t) FROM tsm WHERE realm=?', (realm,)).fetchone()
    except Exception:
        t = None
    if t:
        out.append(dict(id='tsm', name='TradeSkillMaster', t=t, items=titems, points=d,
                        note='Öffentliche Marktdaten, ein Stand pro Tag: Marktwert, Verkäufe pro Tag, keine Mengen im AH.'))
    return out


def de_names():
    """German item names (tools/de_names.py fetches them); the page shows these and keeps English for the search."""
    p = os.path.join(HERE, 'data', 'names_de.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}


def thin(series):
    """Price history for the page's chart without bloating it: every point of the last 48 hours (hourly Blizzard
    dumps), then the last point per 6 hours up to 7 days, then one per day up to 30 days. So the 7- and 30-day views
    and the 6 h ... 30 day changes keep their reference points while the page stays small."""
    if not series:
        return []
    last, out, seen = series[-1][0], [], set()
    for p in reversed(series):
        age = last - p[0]
        if age > 30 * 86400:
            break
        key = ('h', p[0]) if age <= 48 * 3600 else ('q', p[0] // 21600) if age <= 7 * 86400 else ('d', p[0] // 86400)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out[::-1]


def pack(live, cfg, wanted, fills):
    """What the page needs from a scan data set (real or demo); per-item prices only for items the page shows."""
    if not live:
        return None
    best = [dict(b) for b in (live.get('best') or [])[:400]]
    for b in best:   # items outside the model page: their own chart, order book and market value for the detail view
        if str(b['id']) in wanted:
            continue
        lr = live['rows'].get(b['id']) or {}
        if lr.get('series'):
            b['spark'] = [[p[0], p[1], p[3]] for p in thin(lr['series'])]
        b['med7'], b['sell'] = lr.get('median7'), lr.get('sell')
        if live.get('book', {}).get(b['id']):
            b['ob'] = live['book'][b['id']][:60]
        if live.get('mv', {}).get(b['id']):
            b['mv'] = live['mv'][b['id']]
    rows = {}
    for iid, lr in live['rows'].items():
        if str(iid) in wanted:
            rows[str(iid)] = dict(lp=lr['price'], lq=lr['qty'], sell=lr['sell'], med7=lr['median7'],
                                  d1=lr['p_d1'], d3=lr['p_d3'], d7=lr['p_d7'], flags=live['flags'].get(iid, []),
                                  spark=[[p[0], p[1], p[3]] for p in thin(lr['series'])], tsm=lr.get('tsm'),
                                  st=1 if lr.get('stale') else 0, ref=round(lr['ref']) if lr.get('ref') else None,
                                  tr=round(lr['trend'], 3) if lr.get('trend') else None)
            m, dp = lr.get('sold_raw'), lr.get('depth')
            if m:   # measured from single auctions (ah/rawscan.py): bought per day, at which prices, restock
                rows[str(iid)]['sd'] = dict(d=round(m['per_day'], 1), lo=round(m['low'], 1), hi=round(m['high'], 1),
                                            avg=round(m['avg']) if m['avg'] else None, top=m['top'], new=round(m['new'], 1), h=round(m['hours'], 1))
            if live.get('book', {}).get(iid):   # order book of the newest full scan: [unit price, units, auctions]
                rows[str(iid)]['ob'] = live['book'][iid]
            if live.get('mv', {}).get(iid):     # market value (median of what is listed) per full scan
                rows[str(iid)]['mv'] = live['mv'][iid]
            if dp:  # depth of the newest full scan: units near the cheapest one, fresh listings
                rows[str(iid)]['dp'] = dict(u=dp['units'], a=dp['auctions'], u110=dp['u110'], u125=dp['u125'], u150=dp['u150'],
                                            c150=dp['cost150'], fr=dp['fresh'], sh=dp['short'])
    return dict(realm=live['realm'], at=datetime.fromtimestamp(live['now']).strftime('%d.%m.%Y %H:%M'), tsm_days=live.get('tsm_days'),
                qsim=bool(live.get('qty_simulated')), days=live['days'], ob_at=live.get('book_ts'), n_scans=live['n_scans'], todo=live['todo'],
                flips=flips(live, cfg), favor=favor_index(live, fills), rows=rows, best=best,
                best_h=best[0]['h'] if best else None,
                crafts=[dict(id=c.get('item_id'), name=c['name'], prof=c['prof'], learn=c['learn'], cost=c['cost'], revenue=c['revenue'],
                             margin=c['margin'], qty=c['qty'], sold=c.get('sold'), capped=c.get('capped'), spec=c.get('spec')) for c in live['crafts'][:250]])  # the page filters by own profession and skill


def main():
    share = '--teilen' in sys.argv
    cfg = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
    prof = load('data_prof.json')
    gap = load('gap_model.json')
    detail = load('demand_detail.json')
    supply = load('supply_model.json')
    refine = load('refine.json')
    limited = load('limited_recipes.json')

    # crafted intermediates (bolts, cured hides, dyes ...) inherit the supply ratio of their main input
    recipe_of, maker_of = {}, {}
    for pkey, v in prof['profs'].items():
        for r in v['recipes']:
            if r.get('id') and r.get('reagents'):
                recipe_of.setdefault(str(r['id']), r)
                maker_of.setdefault(str(r['id']), pkey)   # who makes it: decides who can get it, not who finds the input

    def sup_of(iid, depth=0):
        if iid in supply:
            return supply[iid], False
        r = recipe_of.get(iid)
        if r and depth < 2:
            for x in sorted(r['reagents'], key=lambda x: -x['count']):
                s, _ = sup_of(str(x['id']), depth + 1)
                if s:
                    return s, True
        return None, False

    items = []
    for r in gap:
        if r['volume'] < 20:
            continue
        iid = str(r['item_id'])
        s, inherited = sup_of(iid)
        items.append(dict(id=r['item_id'], name=r['name'], kind=r['kind'], new=r['new'], slvl=r['supply_level'],
                          gate=r['demand_level'], vol=r['volume'], profs=r['profs'], det=detail.get(iid, {}),
                          sup=s, inh=inherited, cd=COOLDOWN.get(r['name']),
                          maker=maker_of.get(iid) if inherited else None))
    ref = [dict(kind=o['kind'], name=o['name'], id=o['item_id'], skill=o['skill'], req=o['req'], count=o['count'],
                inputs_list=o.get('inputs_list', []), mass=o['mass_inputs'], why=o['why']) for o in refine]

    fills = {}   # Merchant's Favor crate tier -> [(item id, name, count)]
    for r in gap:
        c = detail.get(str(r['item_id']), {}).get('crate')
        if c:
            tier, n = c.rsplit(' x', 1)
            fills.setdefault(tier, []).append((r['item_id'], r['name'], int(n)))
    # Angel-Radar (tools/fishing_model.py): its fish, products and reagents need live prices as well
    fishing = load('fishing.json') if os.path.exists(os.path.join(ROOT, 'fishing.json')) else None
    # Kürschner-Radar (tools/skinning_model.py): leathers and by-catch of the skinnable mobs
    skinning = load('skinning.json') if os.path.exists(os.path.join(ROOT, 'skinning.json')) else None
    wanted = ({str(i['id']) for i in items} | {str(o['item_id']) for o in refine}
              | {str(x['id']) for o in refine for x in o.get('inputs_list', [])} | set((fishing or {}).get('items', {}))
              | set((skinning or {}).get('items', {})))
    payload = dict(generated=datetime.now().strftime('%d.%m.%Y %H:%M'), shared=share, items=items, refine=ref, fishing=fishing,
                   skinning=skinning,
                   launch=cfg.get('launch', '2026-11-05'), launch_at=cfg.get('launch_zeit', '2026-11-04T23:00:00Z'),
                   fee=cfg.get('ah_gebuehr', 0.05),
                   vend={k: v for k, v in cfg['vendor_kosten'].items() if not k.startswith('_')},
                   limited=limited, kk=load('kaufkraft.json'), de=de_names(), annahmen=json.load(open(os.path.join(ROOT, 'tools', 'annahmen.json'), encoding='utf-8')),
                   live=None if share else pack(live_data(cfg), cfg, wanted, fills),
                   # what live_payload() needs to add live data to this page later (website worker)
                   ctx=dict(wanted=sorted(wanted), fills=fills))
    tpl = open(os.path.join(HERE, 'dashboard_template.html'), encoding='utf-8').read()
    # header artwork is embedded, so the single file also works behind the website login
    banner = os.path.join(HERE, 'header-banner.webp')
    if os.path.exists(banner):
        tpl = tpl.replace('/*__BANNER__*/', 'data:image/webp;base64,' + base64.b64encode(open(banner, 'rb').read()).decode())
    out = os.path.join(ROOT, 'dashboard-teilen.html' if share else 'dashboard.html')
    # the markers let the website's worker swap in DATA with live data from the members' scans
    if payload.get('live') and os.path.exists(os.path.join(HERE, 'ah.db')):  # where the local live numbers come from
        payload['live']['sources'] = sources_of(sqlite3.connect(os.path.join(HERE, 'ah.db')), payload['live']['realm'])
    try:   # player census of the auction house (ah/census.py; at most every 12 hours, the website's worker keeps it current)
        import census
        cuts = census.cuts_for([cfg.get('ruleset', '')])
        payload['census'] = census.payload(census.update(os.path.join(HERE, 'census.json'), cuts)[0], cuts)
    except Exception as e:
        print('Census nicht geladen:', e)
    data = '/*__DATA_START__*/' + json.dumps(payload, ensure_ascii=False) + '/*__DATA_END__*/'
    open(out, 'w', encoding='utf-8').write(tpl.replace('/*__DATA__*/null', data))
    print(out)


if __name__ == '__main__':
    main()
