"""Reads the newest Blackthornes Tradeskills file (WTF/Account/*/SavedVariables/Blackthornes_TS.lua) and writes:

- ah/data/spieldaten.json   game facts, no personal data (also for the website's worker): what vendors charge per
                            unit for what they sell without limit, what vendors pay for items (item tooltips), the AH
                            deposit as a share of the vendor price per listing time (median of own listings)
- ah/data/eigene_daten.json  only for the local tool: own characters with level and professions; analyse.py takes the
                            highest skill per profession for the daily craft tips

Runs at the end of ah/snapshot.py; on its own:  python ah/blackthornes.py
Vendor prices are the prices the scanning character paid: with a reputation discount (honored and up) about 10 %
below the list price.
"""
import glob, json, os, statistics, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lua_sv

DEFAULT_WOW = r'C:\Program Files (x86)\World of Warcraft\_forever_'
DATA = os.path.join(HERE, 'data')
# German profession names (the client's) -> the tool's keys
PROF = {'Alchimie': 'alchemy', 'Schmiedekunst': 'blacksmithing', 'Verzauberkunst': 'enchanting', 'Ingenieurskunst': 'engineering',
        'Lederverarbeitung': 'leatherworking', 'Schneiderei': 'tailoring', 'Kochkunst': 'cooking', 'Kochen': 'cooking',
        'Erste Hilfe': 'first-aid', 'Kräuterkunde': 'herbalism', 'Bergbau': 'mining', 'Kürschnerei': 'skinning',
        'Angeln': 'fishing', 'Alchemy': 'alchemy', 'Blacksmithing': 'blacksmithing', 'Enchanting': 'enchanting',
        'Engineering': 'engineering', 'Leatherworking': 'leatherworking', 'Tailoring': 'tailoring', 'Cooking': 'cooking',
        'First Aid': 'first-aid', 'Herbalism': 'herbalism', 'Mining': 'mining', 'Skinning': 'skinning', 'Fishing': 'fishing'}
DURATION = {1: '12h', 2: '24h', 3: '48h'}


def text(s):
    """The file is read as latin-1 but holds UTF-8 text."""
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeError, AttributeError):
        return s


def newest(wow):
    files = glob.glob(os.path.join(wow, 'WTF', 'Account', '*', 'SavedVariables', 'Blackthornes_TS.lua'))
    return max(files, key=os.path.getmtime) if files else None


def export(wow=DEFAULT_WOW):
    path = newest(wow)
    if not path:
        return None
    db = lua_sv.loads(open(path, 'rb').read().decode('latin-1')).get('BlackthornesTSDB') or {}
    stand = int(os.path.getmtime(path))
    # vendors: price per unit (stack price / stack), only what they sell without limit (limited stock is no floor)
    buy = {}
    for i, v in (db.get('vendorPrices') or {}).items():
        if v.get('price') and not v.get('limited') and not v.get('extendedCost'):
            buy[str(i)] = round(v['price'] / max(1, v.get('stack') or 1), 2)
    # what vendors pay: item facts (tooltip value), confirmed by own vendor sales
    sell = {str(i): f['v'] for i, f in (db.get('itemFacts') or {}).items() if isinstance(f, dict) and f.get('v') is not None}
    for i, v in (db.get('vendorPaid') or {}).items():
        if v.get('pay') is not None:
            sell[str(i)] = v['pay']
    # deposit per listing as a share of the vendor price, items worth at least 1s (below, the minimum deposit rules)
    dep = {}
    for i, v in (db.get('deposits') or {}).items():
        s = sell.get(str(i))
        if s and s >= 100 and v.get('unit') and v.get('duration') in DURATION:
            dep.setdefault(DURATION[v['duration']], []).append(v['unit'] / s)
    deposit = {k: dict(anteil=round(statistics.median(x), 3), n=len(x)) for k, x in dep.items()}
    spiel = dict(_hinweis='Aus dem Spiel gelesen (Blackthornes Tradeskills, ah/blackthornes.py), ersetzt die Schätzwerte in '
                          'config.json: haendler_kauf = Kupfer pro Stück beim Händler (ohne limitierte Ware; mit dem Ruf-Rabatt '
                          'des Charakters, der dort war), haendler_verkauf = was der Händler zahlt, einstellgebuehr = Anteil am '
                          'Händlerpreis je Auktion (Median eigener Auktionen, Items ab 1s).',
                 stand=stand, haendler_kauf=dict(sorted(buy.items(), key=lambda kv: int(kv[0]))),
                 haendler_verkauf=dict(sorted(sell.items(), key=lambda kv: int(kv[0]))), einstellgebuehr=deposit)
    chars, best, known = [], {}, set()
    for c in (db.get('characters') or {}).values():
        profs = {}
        for p in c.get('professions') or []:
            key = PROF.get(text(p.get('name') or ''))
            if p.get('learned') and key and p.get('skillLevel'):
                profs[key] = p['skillLevel']
                best[key] = max(best.get(key, 0), p['skillLevel'])
        rec = {r.get('outputItemID') for r in (c.get('recipes') or {}).values() if isinstance(r, dict) and r.get('outputItemID')}
        known |= rec
        chars.append(dict(name=text(c.get('name')), level=c.get('level'), berufe=profs, rezepte=len(rec), gesehen=c.get('seenAt')))
    eigen = dict(_hinweis='Nur lokal (nie auf die geteilte Seite): eigene Charaktere aus Blackthornes Tradeskills. berufe = '
                          'höchster Skill je Beruf über alle Charaktere, rezepte = Item-IDs, die eure Charaktere herstellen können; analyse.py '
                          'nimmt beides für die Craft-Tipps im Report.',
                 stand=stand, berufe=best, rezepte=sorted(known), charaktere=chars)
    os.makedirs(DATA, exist_ok=True)
    for name, d in (('spieldaten.json', spiel), ('eigene_daten.json', eigen)):
        json.dump(d, open(os.path.join(DATA, name), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return (f"Blackthornes ({time.strftime('%d.%m. %H:%M', time.localtime(stand))}): {len(buy)} Händlerpreise, "
            f"{len(sell)} Verkaufswerte, Einstellgebühr " + ', '.join(f"{k} {v['anteil']:.0%} (n={v['n']})" for k, v in sorted(deposit.items()))
            + '; Berufe ' + (', '.join(f'{k} {v}' for k, v in sorted(best.items(), key=lambda kv: -kv[1])) or '-') + f', {len(known)} Rezepte')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print(export(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_WOW) or 'Keine Blackthornes_TS.lua gefunden.')
