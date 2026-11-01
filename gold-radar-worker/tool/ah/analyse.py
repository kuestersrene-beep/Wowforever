"""Phase 3: evaluates ah.db and writes a short, action-oriented report (Markdown + HTML chart).

    python ah/analyse.py                 (newest data, realm from config.json or the one with most data)
    python ah/analyse.py --realm "Realmname-Alliance"
"""
import argparse, json, os, sqlite3, statistics, html
from datetime import datetime, date

HERE = os.path.dirname(os.path.abspath(__file__))
PROF_DE = {'alchemy': 'Alchemie', 'blacksmithing': 'Schmiedekunst', 'enchanting': 'Verzauberkunst', 'engineering': 'Ingenieurskunst', 'leatherworking': 'Lederverarbeitung', 'tailoring': 'Schneiderei', 'cooking': 'Kochen', 'first-aid': 'Erste Hilfe'}
DATA = os.path.join(HERE, 'data')
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


def analyse(con, realm, cfg, now):
    items = json.load(open(os.path.join(DATA, 'items.json'), encoding='utf-8'))
    watch = json.load(open(os.path.join(DATA, 'watchlist.json'), encoding='utf-8'))
    recipes = json.load(open(os.path.join(DATA, 'recipes.json'), encoding='utf-8'))
    crates_path = os.path.join(DATA, 'crates.json')
    crates = json.load(open(crates_path, encoding='utf-8')) if os.path.exists(crates_path) else {}
    series = load_series(con, realm)
    try:  # latest TSM sales per item (ah/tsm.py), if any
        tsm = {i: s for i, s in con.execute('SELECT item_id, sold_per_day FROM tsm t WHERE realm=? AND t = '
                                            '(SELECT MAX(t) FROM tsm u WHERE u.realm=t.realm AND u.item_id=t.item_id)', (realm,))}
    except sqlite3.OperationalError:
        tsm = {}
    rows = {}
    for item, ser in series.items():
        last = ser[-1]
        price = last[2] or last[1]
        if not price:
            continue
        # 7-day reference: scans with at least 5 listed, so a few lone listings cannot set the "normal" price;
        # thin markets (never 5 listed) fall back to all points
        week = [p[1] for p in ser if p[0] >= now - 7 * D and p[1] and (p[3] or 0) >= 5] \
            or [p[1] for p in ser if p[0] >= now - 7 * D and p[1]]
        r = dict(item=item, name=items.get(str(item), {}).get('name', f'#{item}'), price=price, market=last[1],
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
        r['tsm_sold'] = tsm.get(item)
        if r['gone_per_day'] is None and r['tsm_sold'] is not None:
            r['gone_per_day'] = r['tsm_sold']
        rows[item] = r

    def price_of(i):
        r = rows.get(i)
        if r:
            return r['price']
        return cfg['vendor_kosten'].get(str(i))

    fee = cfg.get('ah_gebuehr', 0.05)
    crafts = []
    for rc in recipes:
        if cfg['meine_berufe'] and rc['prof'] not in cfg['meine_berufe']:
            continue
        prod = rows.get(rc['item_id'])
        if not prod:
            continue
        costs = [price_of(i) for i, _ in rc['reagents']]
        if any(c is None for c in costs):
            continue
        cost = sum(c * n for c, (_, n) in zip(costs, rc['reagents'])) / rc['count']
        revenue = prod['price'] * (1 - fee)
        if cost > 0 and (revenue - cost) / cost >= cfg['min_craft_marge']:
            crafts.append(dict(prof=rc['prof'], item_id=rc['item_id'], name=prod['name'], cost=cost, revenue=revenue,
                               margin=(revenue - cost) / cost, profit=revenue - cost, qty=prod['qty'], learn=rc['learn']))
    crafts.sort(key=lambda c: -c['profit'])

    days = (date.fromtimestamp(now) - date.fromisoformat(cfg['launch'])).days
    sig = {k: [] for k in ('akku', 'unter', 'heiss', 'vendor', 'squeeze', 'welle')}
    for r in rows.values():
        p3, q3 = r['p_d3'], r['q_d3']
        if p3 is not None and q3 is not None and p3 > 0.10 and q3 < -0.20:
            sig['akku'].append(r)
        band = r['w'].get('band')
        if r['w'].get('score', 0) >= 40 and band in BAND_PEAK_DAYS:
            start = BAND_PEAK_DAYS[band][0]
            if start - days >= 3 and (p3 is None or p3 < 0.05):
                sig['unter'].append(r)
        if r['median7'] and r['price'] > 2 * r['median7'] and (r['q_d1'] or 0) > 0:
            sig['heiss'].append(r)
        # squeeze: the market sells more per day than is listed, the rest is about to be bought out
        if r['gone_per_day'] and r['qty'] and r['gone_per_day'] >= r['qty'] and r not in sig['heiss']:
            sig['squeeze'].append(r)
        # worth the trip only from 20s total profit on
        if r['sell'] and r['price'] and r['qty'] and (r['sell'] * 0.95 - r['price']) * r['qty'] >= 2000:
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
    for r in sorted(sig['vendor'], key=lambda r: -(r['sell'] - r['price']) * (r['qty'] or 1))[:3]:
        acts.append(dict(kind='haendler', id=r['item'], name=r['name'], qty=r['qty'], limit=round(r['sell'] * 0.95),
                         limit_label='Kaufen bis', why=f"Buyout {money(r['price'])} < Händlerpreis {money(r['sell'])}"))
    for r in sorted(sig['unter'], key=lambda r: -r['w']['score'])[:3]:
        acts.append(dict(kind='kaufen', id=r['item'], name=r['name'], limit=round((r['median7'] or r['price']) * 1.05), limit_label='Kaufen bis',
                         why=f"Die Spieler für Levelband {r['w']['band']} kommen erst noch, der Preis ist noch nicht gestiegen" + (f" ({fmt_pct(r['p_d3'])} in 3 Tagen)" if r['p_d3'] is not None else '')))
    for r in sorted(sig['akku'], key=lambda r: -(r['p_d3'] or 0))[:2]:
        acts.append(dict(kind='halten', id=r['item'], name=r['name'], limit=round(r['price']), limit_label='Nicht unter',
                         why=f"Preis {fmt_pct(r['p_d3'])}, Menge {fmt_pct(r['q_d3'])} in 3 Tagen: Angebot wird knapp"))
    for r in sig['squeeze'][:2]:
        crate = r['crate']
        acts.append(dict(kind='kaufen', id=r['item'], name=r['name'], qty=r['qty'], limit=round((r['median7'] or r['price']) * 1.25),
                         limit_label='Kaufen bis',
                         why=f"Leerkauf droht: ca. {r['gone_per_day']:.0f} Stück/Tag verkauft, nur {r['qty']} im AH"
                             + (f"; steckt in Merchant's-Favor-Crates ({crate})" if crate else '') + '. Restbestand abgreifen, teurer neu einstellen'))
    for r in sig['heiss'][:2]:
        acts.append(dict(kind='verkaufen', id=r['item'], name=r['name'], limit=round(r['median7'] * 1.5), limit_label='Mindestens',
                         why=f"Preis {money(r['price'])} ist mehr als 2x 7-Tage-Median {money(r['median7'])}, Menge steigt wieder"))
    for c in crafts[:3]:
        acts.append(dict(kind='craften', id=c.get('item_id'), name=c['name'], prof=PROF_DE.get(c['prof'], c['prof']), skill=c['learn'],
                         cost=round(c['cost']), revenue=round(c['revenue']), margin=c['margin'], limit=round(c['revenue'] - c['cost']),
                         limit_label='Gewinn', why=f"Kosten {money(c['cost'])}, Erlös nach Gebühr {money(c['revenue'])} (+{c['margin']:.0%})"))
    return acts[:10]


def todo_text(a):
    """(what, why) for the Markdown report."""
    n, lim = f"**{a['name']}**", money(a['limit'])
    what = {'haendler': f"{n} alle {a.get('qty')} kaufen bis {lim} und an den Händler verkaufen",
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
    table('Akkumulation: Preis steigt, Menge fällt', sig['akku'], base_cols)
    table('Unterbewertet: hoher Score, flacher Preis, Spitzennachfrage kommt noch', sig['unter'], base_cols)
    table('Überhitzt: über 2x 7-Tage-Median, Angebot kommt nach', sig['heiss'], base_cols)
    table('Leerkauf droht: pro Tag wird mehr verkauft als im AH liegt', sig['squeeze'], base_cols)
    table('Vendor-Flip: Buyout unter Händlerpreis', sig['vendor'][:20],
          [('Item', lambda r: r['name']), ('Buyout', lambda r: money(r['price'])),
           ('Händler zahlt', lambda r: money(r['sell'])), ('Menge', lambda r: r['qty'])])
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
