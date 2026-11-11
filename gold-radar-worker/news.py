"""Neuigkeiten für den Goldkalender des Blackwater Terminals.

Vier Quellen, alle auf dem Server:
- neue Items im AH: ein Item, das zum ersten Mal in einem Scan oder im Blizzard-Dump auftaucht (first_seen-<ruleset>.db
  merkt sich, wann). Beim allerersten Lauf wird nur der Bestand gemerkt, ohne Meldung.
- Blizzard-Blueposts zu WoW Forever (dieselben Foren-Feeds wie der Discord-Bot, DE + US): voller Text des Posts.
- foreverchanges.pro: RSS der Patchnotes; zu jedem neuen Eintrag der Abschnitt der Patchnotes-Seite mit seinen Item-Links.
- KI-Wochenbericht: kommt über die Website (/gold-radar/news) in dieselbe Tabelle.
Texte werden auf Item-Namen (Deutsch und Englisch, eindeutige Namen) und Stichworte (Droprate, Rezept, Händler, AH ...)
abgesucht. Gespeichert wird in gold_radar_news (Supabase). Nichts geht von selbst raus: der Betreiber gibt jede Meldung
unter /admin/gold-radar getrennt frei, für die Tool-Seite (show_page, Goldkalender) und für Discord (post_discord,
GOLD_RADAR_NEWS_WEBHOOK).

Nur Standardbibliothek. Jede Quelle, die nicht antwortet, wird beim nächsten Durchlauf erneut versucht.
"""
import html, json, logging, os, re, sqlite3, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

log = logging.getLogger('gold-radar-worker')
UA = 'BlackwaterTerminal/1.0 (Gilden-Tool, gold-radar-worker)'
BLUE = [
    dict(name='Blizzard-Forum (DE)', basis='https://eu.forums.blizzard.com/de/wow', kat={'255', '256', '257'}),
    dict(name='Blizzard-Forum (US)', basis='https://us.forums.blizzard.com/en/wow', kat={'346', '347', '348', '349'}),
]
FC_FEED = 'https://foreverchanges.pro/de/patch-notes/feed.xml'
FC_PAGE = 'https://foreverchanges.pro/de/patch-notes'
# Stichworte (klein geschrieben, Deutsch und Englisch) -> Schlagwort
TAGS = {
    'Droprate': ['drop rate', 'drop chance', 'droprate', 'dropchance', 'drops more', 'drops less', 'häufiger', 'seltener'],
    'Rezept': ['recipe', 'pattern', 'schematic', 'formula', 'rezept', 'muster', 'bauplan', 'formel'],
    'Händler': ['vendor', 'händler', 'sell price', 'verkaufspreis'],
    'Auktionshaus': ['auction', 'auktionshaus', 'deposit', 'anzahlung'],
    'Beruf': ['profession', 'crafting', 'beruf', 'herstell', 'skill point', 'fertigkeitspunkt', 'alchemy', 'alchemie',
              'blacksmithing', 'schmiedekunst', 'tailoring', 'schneiderei', 'leatherworking', 'lederverarbeitung', 'engineering',
              'ingenieurskunst', 'enchanting', 'verzauberkunst', 'cooking', 'kochkunst', 'fishing', 'angeln', 'herbalism',
              'kräuterkunde', 'mining', 'bergbau', 'skinning', 'kürschnerei'],
    'Gunst/Kisten': ["merchant's favor", 'händlergunst', 'waylaid crate', 'abgefangene kiste', 'craftsman', 'verfügung'],
    'Event': ['darkmoon', 'dunkelmond', 'winter veil', 'winterhauch', 'lunar', 'mondfest', 'hallow', 'schlotternächte',
              'midsummer', 'sonnenwend', 'noblegarden', 'nobelgarten', 'love is in the air'],
    'Gold': [' gold', 'silver', 'copper', 'silber', 'kupfer', 'coin', 'münz'],
    'Nerf': ['nerf', 'reduced', 'decreased', 'no longer', 'verringert', 'gesenkt', 'nicht mehr'],
    'Buff': ['increased', 'erhöht', 'now also', 'jetzt auch'],
    'Neu': ['new item', 'added', 'neue gegenstände', 'hinzugefügt', 'neu in'],
    'Raid/Dungeon': ['raid', 'dungeon', 'molten core', 'geschmolzener kern', 'onyxia', 'instanz'],
}
GOLD_TAGS = {'Droprate', 'Rezept', 'Händler', 'Auktionshaus', 'Gunst/Kisten', 'Event', 'Gold'}
# Einzelwort-Namen, die in normalem Text vorkommen: nie als Item-Treffer zählen
STOP = {w.lower() for w in (
    'Water Gloves Boots Robe Torch Key Arrow Map Scroll Hammer Sword Axe Mace Dagger Staff Shield Ring Cloak Pants Belt '
    'Helm Bandage Shirt Bread Cheese Apple Fish Meat Egg Wing Feather Tooth Claw Fang Scale Hide Leather Cloth Silk Wool '
    'Linen Stone Coal Salt Flux Vial Thread Dye Spice Spices Ore Bar Gem Pearl Dust Essence Shard Crystal Potion Elixir '
    'Flask Oil Wasser Handschuhe Stiefel Robe Fackel Schlüssel Pfeil Karte Rolle Hammer Schwert Axt Streitkolben Dolch Stab '
    'Schild Ring Umhang Hose Gürtel Helm Verband Hemd Brot Käse Apfel Fisch Fleisch Ei Flügel Feder Zahn Klaue Fangzahn '
    'Schuppe Balg Leder Stoff Seide Wolle Leinen Stein Kohle Salz Flussmittel Phiole Faden Farbstoff Gewürz Gewürze Erz '
    'Barren Edelstein Perle Staub Essenz Splitter Kristall Trank Elixier Fläschchen Öl Gold Silber Kupfer').split()}


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'de,en'})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode('utf-8', 'replace')


def plain(h):
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', h or '', flags=re.S)
    t = html.unescape(re.sub(r'<[^>]+>', ' ', h))
    return re.sub(r'\s+', ' ', t).strip()


def money(c):
    if c is None:
        return '–'
    c = int(round(c))
    g, s, k = c // 10000, c // 100 % 100, c % 100
    return ' '.join(x for x in (f'{g}g' if g else '', f'{s}s' if s else '', f'{k}c' if k or not (g or s) else '') if x)


# ---------- item names: English (tool/ah/data/items.json) and the scans' item DB (German client names) ----------
class Names:
    def __init__(self, tool_dir, cons):
        self.name = {}   # id -> display name (German first)
        by = {}
        try:
            for i, v in json.load(open(os.path.join(tool_dir, 'data', 'items.json'), encoding='utf-8')).items():
                if v.get('name'):
                    by.setdefault(v['name'], set()).add(int(i))
                    self.name.setdefault(int(i), v['name'])
        except OSError:
            pass
        for con in cons:
            try:
                for i, n in con.execute('SELECT item_id, name FROM item_meta WHERE name IS NOT NULL'):
                    by.setdefault(n, set()).add(i)
                    self.name[i] = n
            except sqlite3.Error:
                pass
        # only names that mean one item and are specific enough to be one in a text
        self.terms = {}
        for n, ids in by.items():
            if len(ids) != 1 or n.startswith(('Recipe:', 'Pattern:', 'Plans:', 'Schematic:', 'Formula:', "Craftsman's Writ", 'Handwerksverfügung')):
                continue
            words = n.split()
            if len(n) < 6 or (len(words) == 1 and (len(n) < 7 or n.lower() in STOP)):
                continue
            self.terms[n.lower()] = next(iter(ids))

    def find(self, text):
        low, out = text.lower(), set()
        for term, i in self.terms.items():
            if term in low and re.search(r'(?<![\w])' + re.escape(term) + r'(?![\w])', low):
                out.add(i)
        return out


def tags_of(text):
    low = ' ' + text.lower()
    return [t for t, words in TAGS.items() if any(w in low for w in words)]


def item_info(cons, ids, names):
    """[{id, name, price, qty}] with the newest lowest price and quantity of the first auction house that has the item."""
    out = []
    for i in list(ids)[:25]:
        row = None
        for con in cons:
            row = con.execute('SELECT min, quantity FROM scans WHERE item_id=? AND min IS NOT NULL ORDER BY seen DESC LIMIT 1', (i,)).fetchone()
            if row:
                break
        if i not in names.name and not row:
            continue
        out.append(dict(id=i, name=names.name.get(i, f'#{i}'), price=row[0] if row else None, qty=row[1] if row else None))
    return sorted(out, key=lambda x: -(x['price'] or 0))


def score_of(kind, items, tags):
    return 3 * len(items) + sum(2 for t in tags if t in GOLD_TAGS) + len(tags) + (10 if kind in ('item', 'ki') else 0)


# ---------- new items in the auction house ----------
def new_items(con, ruleset, data_dir, names):
    """Rows for items that show up for the first time; the very first call only stores what is there."""
    fs = sqlite3.connect(os.path.join(data_dir, f'first_seen-{ruleset}.db'))
    fs.execute('CREATE TABLE IF NOT EXISTS first_seen (item_id INTEGER PRIMARY KEY, t INTEGER)')
    first = fs.execute('SELECT COUNT(*) FROM first_seen').fetchone()[0] == 0
    have = {i for i, in fs.execute('SELECT item_id FROM first_seen')}
    now = int(time.time())
    seen = con.execute('SELECT item_id, MIN(seen), MAX(seen) FROM scans GROUP BY item_id').fetchall()
    fresh = [(i, t0) for i, t0, t1 in seen if i not in have]
    fs.executemany('INSERT OR IGNORE INTO first_seen VALUES (?,?)', fresh)
    fs.commit()
    fs.close()
    if first or not fresh:
        if first:
            log.info('%s: Neu-Item-Wächter merkt sich %d Items als Bestand', ruleset, len(fresh))
        return []
    # one row per run: what appeared, the dearest first; items new in Forever (ids from 240000) are marked
    info = item_info([con], [i for i, _ in fresh], names)
    forever = sum(1 for x in info if x['id'] >= 240000)
    title = f'Neu im AH: {len(fresh)} {"Item" if len(fresh) == 1 else "Items"}' + (f', davon {forever} neu in Forever' if forever else '')
    return [dict(key=f'item:{ruleset}:{now // 600}', kind='item', ruleset=ruleset, title=title, url=None,
                 body=None, items=info, tags=['Neu'] + (['Neu in Forever'] if forever else []),
                 score=score_of('item', info, []))]


# ---------- Blizzard blue posts ----------
def blue_news(known, names, cons, baseline=False):
    """baseline: first run, only remember what is there (no full texts, marked as sent)."""
    out = []
    for q in BLUE:
        try:
            posts = json.loads(fetch(q['basis'] + '/groups/blizzard-tracker/posts.json')).get('posts', [])
        except Exception as e:
            log.info('Blueposts %s nicht abrufbar: %s', q['name'], e)
            continue
        for p in posts:
            if str(p.get('category_id')) not in q['kat'] and 'forever' not in (p.get('topic_title') or '').lower():
                continue
            key = f"blue:{q['name']}:{p['id']}"
            if key in known:
                continue
            full = p.get('excerpt', '')
            if not baseline:
                try:
                    full = json.loads(fetch(f"{q['basis']}/posts/{p['id']}.json")).get('cooked') or full
                except Exception:
                    pass
                time.sleep(1)   # politely: one post page a second
            text = plain(full)
            title = html.unescape(p.get('topic_title') or 'Bluepost') + (' (Update)' if int(p.get('post_number', 1)) > 1 else '')
            ids, tags = names.find(title + ' ' + text), tags_of(title + ' ' + text)
            items = item_info(cons, ids, names)
            out.append(dict(key=key, kind='blue', ruleset=None, title=f"{title} ({q['name']})"[:300],
                            url=q['basis'] + p.get('url', ''), body=text[:4000], items=items, tags=tags,
                            score=score_of('blue', items, tags)))
    return out


# ---------- foreverchanges patch notes ----------
def fc_news(known, names, cons, baseline=False):
    try:
        root = ET.fromstring(fetch(FC_FEED))
    except Exception as e:
        log.info('foreverchanges-Feed nicht abrufbar: %s', e)
        return []
    entries = [(i.findtext('guid') or i.findtext('link'), i.findtext('title') or '', i.findtext('link') or FC_PAGE,
                i.findtext('description') or '') for i in root.iter('item')]
    new = [e for e in entries if e[0] and f'fc:{e[0]}' not in known]
    if not new:
        return []
    page = ''
    if not baseline:
        try:
            page = fetch(FC_PAGE, timeout=60)
        except Exception:
            pass
    anchors = [m.start() for m in re.finditer(r'id="(?:hotfix-\d{4}-\d{2}-\d{2}|\d+\.\d+\.\d+\.\d+)"', page)]
    out = []
    for guid, title, link, desc in (new if baseline else new[:10]):
        frag = urllib.parse.urlparse(link).fragment
        sec = ''
        i = page.find(f'id="{frag}"') if frag else -1
        if i >= 0:
            j = next((a for a in anchors if a > i), len(page))
            sec = page[i:j]
        ids = {int(x) for x in re.findall(r'/item/(\d+)', sec)}
        text = plain(desc) + ' ' + plain(sec)
        ids |= names.find(text)
        tags = tags_of(text)
        items = item_info(cons, ids, names)
        out.append(dict(key=f'fc:{guid}', kind='fc', ruleset=None, title=f'foreverchanges: {title}'[:300], url=link,
                        body=plain(desc)[:4000], items=items, tags=tags, score=score_of('fc', items, tags)))
    return out


# ---------- Discord ----------
def discord_text(r):
    head = {'item': '🆕', 'blue': '📰', 'fc': '🛠️', 'ki': '🧠'}.get(r['kind'], '•')
    title = f"[{r['title']}]({r['url']})" if r.get('url') else r['title']
    lines = [f"{head} **{title}**"]
    if r.get('items'):
        lines.append('Betrifft: ' + ', '.join(f"[{x['name']}](https://www.wowhead.com/forever/item={x['id']}) ({money(x['price'])}{', ' + str(x['qty']) + ' im AH' if x.get('qty') else ''})"
                                              for x in r['items'][:12]))
    if r.get('tags'):
        lines.append('Stichworte: ' + ', '.join(r['tags']))
    if r['kind'] == 'ki' and r.get('body'):
        lines.append(r['body'][:1500])
    return '\n'.join(lines)[:1950]


def worth_posting(r):
    if r['kind'] in ('item', 'ki'):
        return True
    return bool(r.get('items')) or any(t in GOLD_TAGS for t in r.get('tags', []))


def send(webhook, rows, rest):
    """Posts the rows the owner released for Discord (post_discord) and marks them as sent. Without a webhook nothing
    is marked, so they go out once one is set."""
    if not webhook:
        return 0
    n = 0
    for r in rows[:10]:
        try:
            req = urllib.request.Request(webhook, data=json.dumps({'content': discord_text(r)}).encode(), method='POST',
                                         headers={'Content-Type': 'application/json', 'User-Agent': UA})
            urllib.request.urlopen(req, timeout=20).read()
            time.sleep(1)
        except Exception as e:
            log.warning('Discord-Meldung fehlgeschlagen: %s', e)
            return n
        rest('PATCH', 'gold_radar_news', f'id=eq.{r["id"]}', {'sent_at': datetime.now(timezone.utc).isoformat()}, prefer='return=minimal')
        n += 1
    return n


# ---------- storage and the page ----------
def known_keys(rest):
    rows = rest('GET', 'gold_radar_news', 'select=key&order=created_at.desc&limit=1000') or []
    return {r['key'] for r in rows}


def save(rest, rows):
    """New rows wait for the owner's review (reviewed false), unless marked reviewed (a source's first run)."""
    rows = [dict(r, sent_at=None, show_page=False, post_discord=False, reviewed=bool(r.get('reviewed'))) for r in rows]
    if rows:
        rest('POST', 'gold_radar_news', 'on_conflict=key', rows, prefer='resolution=ignore-duplicates,return=minimal')


def unsent(rest):
    """Rows released for Discord and not posted yet."""
    return rest('GET', 'gold_radar_news', 'post_discord=is.true&sent_at=is.null&order=created_at.asc&limit=20') or []


def released(rest):
    """Ids released for the page: when this changes, the pages are rebuilt."""
    return tuple(r['id'] for r in rest('GET', 'gold_radar_news', 'select=id&show_page=is.true&order=id.desc&limit=80') or [])


def page_rows(rest, ruleset, days=30):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = (f'select=kind,title,url,body,items,tags,score,created_at&show_page=is.true&created_at=gte.{urllib.parse.quote(since)}'
         f'&or=(ruleset.is.null,ruleset.eq.{ruleset})&order=created_at.desc&limit=80')
    out = []
    for r in rest('GET', 'gold_radar_news', q) or []:
        r['body'] = (r.get('body') or '')[:1500 if r['kind'] == 'ki' else 400]
        out.append(r)
    return out
