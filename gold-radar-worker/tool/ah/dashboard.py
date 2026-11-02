"""Builds dashboard.html: profit list from the fresh-realm demand/supply model (windows computed per viewer profile
in the page), item icons and tooltips, refining candidates, limited vendor recipes and live AH signals.

    python ah/dashboard.py            -> dashboard.html (with your own scan data, if any)
    python ah/dashboard.py --teilen   -> dashboard-teilen.html (model only, to give to guild mates)

Both files also contain a demo data set from TradeSkillMaster's public Classic EU data (button "Demo" in the page,
config.json "tsm_demo"). It runs through exactly the same analysis as real scans, but it is another game's economy:
never part of the evaluation.
"""
import math
import random
import base64, glob, json, os, sqlite3, sys, statistics
from datetime import datetime, date

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import analyse, tsm
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
    return dict(realm=realm, now=now, days=days, n_scans=n_scans, rows=rows, crafts=crafts, flags=flags,
                todo=analyse.todo_items(rows, crafts, sig, cfg))


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


def demo_data(cfg, snapdir=None):
    """TSM public data (Classic EU by default) replayed as if it were our own scan on day 3.5 after launch, for
    demonstration only. TSM publishes one state per item (no history, no AH quantities), so every build keeps one copy
    per day in tsm_demo/ and the price history grows from those (up to 14 days). Sold per day stands in for
    sell-through; while there are fewer than 3 days, the average sale price 3 days earlier gives trends a reference."""
    path = cfg.get('tsm_demo') or 'classic/eu/region'
    snapdir = snapdir or os.path.join(ROOT, 'tsm_demo')
    try:
        latest = tsm.archive(path, snapdir)  # on the website the worker keeps this archive (daily)
    except OSError as e:
        print(f'Demo: TSM-Daten nicht erreichbar ({e}), Demo bleibt leer')
        return None
    if not latest:
        return None
    snaps = [tsm.parse(open(f, encoding='utf-8').read()) for f in sorted(glob.glob(os.path.join(snapdir, '20*.csv')))[-14:]]
    known = json.load(open(os.path.join(HERE, 'data', 'items.json'), encoding='utf-8'))
    snaps = [[r for r in rows if str(r['item_id']) in known] for rows in snaps]  # only items that exist in WoW Forever
    launch = datetime.fromisoformat(cfg.get('launch', '2026-11-04'))
    now = int(launch.timestamp() + 3.5 * 86400)
    shift = now - max(r['t'] for r in snaps[-1])
    con = sqlite3.connect(':memory:')
    con.executescript(SCHEMA)
    realm = 'TSM ' + path.split('/')[0].capitalize() + ' ' + path.split('/')[1].upper()
    for rows in snaps:
        for r in rows:
            r['t'] += shift
        tsm.store(con, realm, rows)
    simulate_history(con, realm, snaps)
    simulate_quantities(con, realm, snaps)
    live = analysed(con, realm, cfg, now)
    live['tsm_days'] = len(snaps)
    live['qty_simulated'] = True
    return live


def simulate_history(con, realm, snaps, days=30):
    """DEMO ONLY: TSM gives one state per item, so the demo has no 7- or 30-day price curve. Every item gets a plausible
    daily history before its first real point: a mean-reverting walk that ends at today's price and drifts toward TSM's
    60-day value, more restless for rarely sold items. Reproducible, marked as simulated on the page, never real data."""
    first = min(r['t'] for r in snaps[0])
    for r in snaps[-1]:
        if not r['market']:
            continue
        ref = r.get('historical') or r.get('avg_sale') or r['market']
        rng = random.Random(r['item_id'] * 104729)
        sigma = 0.04 + 0.10 / (1 + (r.get('sold_per_day') or 0))
        x, rows = math.log(r['market'] / ref), []
        for k in range(1, days + 1):
            x = 0.9 * x + rng.gauss(0, sigma)
            price = max(1, int(ref * math.exp(x)))
            rows.append((realm, r['item_id'], first - k * 86400, price, price, None, None, None, int(first)))
        con.executemany('INSERT OR IGNORE INTO scans VALUES (?,?,?,?,?,?,?,?,?)', rows)
    con.commit()


def simulate_quantities(con, realm, snaps):
    """DEMO ONLY: TSM publishes no AH quantities, which leaves the demo without the quantity chart, squeeze signal and
    sell-through. So the demo gets plausible, reproducible quantities: about three days of sales listed, fewer when the
    price is above its long-run value and more when below, with some day-to-day noise. Marked as simulated on the page;
    never used for real data (the live database never goes through here)."""
    sold = {r['item_id']: r for r in snaps[-1]}
    for iid, seen, price in con.execute('SELECT item_id, seen, market FROM scans WHERE realm=?', (realm,)).fetchall():
        r = sold.get(iid)
        if not r or not price:
            continue
        ref = r.get('historical') or r.get('avg_sale') or price
        rng = random.Random(iid * 7919 + seen // 86400)
        q = max(2.0, (r.get('sold_per_day') or 0) * 3.0) * (ref / price) ** 0.5 * rng.uniform(0.8, 1.25)
        con.execute('UPDATE scans SET quantity=? WHERE realm=? AND item_id=? AND seen=?',
                    (int(max(1, min(q, 3000))), realm, iid, seen))
    con.commit()


def flips(live, cfg):
    """AH flip score from live scans (any item, mass goods included, vendor goods excluded):
    (profit per day)^0.35 x margin x safety near the vendor floor x confidence.
    profit per day = (target after fee - price) x units the market absorbs per day (observed sell-through, capped by
    what is listed). Target = 7-day median. Confidence damps thin markets so one listing cannot fake a price."""
    fee = cfg.get('ah_gebuehr', 0.05)
    min_unit, min_day = cfg.get('flip_min_gewinn_stueck', 20), cfg.get('flip_min_gewinn_tag', 2000)
    vendor_goods = set(load('vendor_items.json'))
    vendor_ids = {int(k) for k in cfg['vendor_kosten'] if not k.startswith('_')}
    out = []
    for iid, r in live['rows'].items():
        if iid in vendor_ids or r['name'] in vendor_goods:
            continue
        price, target, vendor, qty = r['price'], r['median7'] or r['market'], r['sell'], r['qty'] or 0
        if not qty and r.get('tsm_sold'):  # no AH quantity (TSM data): about two days of sales
            qty = max(1, round(2 * r['tsm_sold']))
        if not price or not target or not qty:
            continue
        net = target * (1 - fee)
        below_vendor = bool(vendor) and price < vendor * 0.95
        unit = max(net - price, (vendor - price) if below_vendor else 0)
        margin = (price + unit) / price
        liq = r['gone_per_day'] if r['gone_per_day'] is not None else 0.2 * qty
        per_day = unit * min(max(liq, 1), qty)
        if unit < min_unit or per_day < min_day or (margin < 1.15 and not below_vendor):
            continue
        floor = price / vendor if vendor else None          # 1.0 = price equals what the vendor pays
        safety = 3.0 if below_vendor else (1.0 + 2.0 * max(0.0, (1.3 - floor) / 1.3) if floor else 1.0)
        points = len([p for p in r['series'] if p[1]])
        conf = min(1.0, qty / 20) * min(1.0, points / 4)
        score = (per_day ** cfg.get('flip_exponent', 0.35)) * margin * safety * conf
        note = []
        if qty < 10:
            note.append('dünner Markt')
        if points < 4:
            note.append('wenig Messpunkte')
        out.append(dict(id=iid, name=r['name'], price=price, target=target, margin=margin, vendor=vendor, floor=floor,
                        qty=qty, liq=r['gone_per_day'], unit=unit, per_day=per_day, conf=conf, score=score,
                        below_vendor=below_vendor, buy_max=net / 1.15, note=', '.join(note)))
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
    rows = {}
    for iid, lr in live['rows'].items():
        if str(iid) in wanted:
            rows[str(iid)] = dict(lp=lr['price'], lq=lr['qty'], sell=lr['sell'], med7=lr['median7'],
                                  d1=lr['p_d1'], d3=lr['p_d3'], d7=lr['p_d7'], flags=live['flags'].get(iid, []),
                                  spark=[[p[0], p[1], p[3]] for p in thin(lr['series'])], tsm=lr.get('tsm'))
    return dict(realm=live['realm'], at=datetime.fromtimestamp(live['now']).strftime('%d.%m.%Y %H:%M'), tsm_days=live.get('tsm_days'),
                qsim=bool(live.get('qty_simulated')), days=live['days'], n_scans=live['n_scans'], todo=live['todo'],
                flips=flips(live, cfg), favor=favor_index(live, fills), rows=rows,
                crafts=[dict(id=c.get('item_id'), name=c['name'], prof=c['prof'], learn=c['learn'], cost=c['cost'], revenue=c['revenue'],
                             margin=c['margin'], qty=c['qty']) for c in live['crafts'][:250]])  # the page filters by own profession and skill


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
    recipe_of = {}
    for v in prof['profs'].values():
        for r in v['recipes']:
            if r.get('id') and r.get('reagents'):
                recipe_of.setdefault(str(r['id']), r)

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
                          sup=s, inh=inherited, cd=COOLDOWN.get(r['name'])))
    ref = [dict(kind=o['kind'], name=o['name'], id=o['item_id'], skill=o['skill'], req=o['req'], count=o['count'],
                inputs_list=o.get('inputs_list', []), mass=o['mass_inputs'], why=o['why']) for o in refine]

    fills = {}   # Merchant's Favor crate tier -> [(item id, name, count)]
    for r in gap:
        c = detail.get(str(r['item_id']), {}).get('crate')
        if c:
            tier, n = c.rsplit(' x', 1)
            fills.setdefault(tier, []).append((r['item_id'], r['name'], int(n)))
    wanted = ({str(i['id']) for i in items} | {str(o['item_id']) for o in refine}
              | {str(x['id']) for o in refine for x in o.get('inputs_list', [])})
    payload = dict(generated=datetime.now().strftime('%d.%m.%Y %H:%M'), shared=share, items=items, refine=ref,
                   launch=cfg.get('launch', '2026-11-04'), fee=cfg.get('ah_gebuehr', 0.05),
                   vend={k: v for k, v in cfg['vendor_kosten'].items() if not k.startswith('_')},
                   limited=limited, kk=load('kaufkraft.json'), annahmen=json.load(open(os.path.join(ROOT, 'tools', 'annahmen.json'), encoding='utf-8')),
                   live=None if share else pack(live_data(cfg), cfg, wanted, fills),
                   demo=pack(demo_data(cfg), cfg, wanted, fills),
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
    data = '/*__DATA_START__*/' + json.dumps(payload, ensure_ascii=False) + '/*__DATA_END__*/'
    open(out, 'w', encoding='utf-8').write(tpl.replace('/*__DATA__*/null', data))
    print(out)


if __name__ == '__main__':
    main()
