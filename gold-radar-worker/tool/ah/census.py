"""Player census of a WoW Forever auction house (region, ruleset, faction) from two public sources.

Both read Blizzard's character API and only list characters from level 10 on; neither is complete:
- classicarmory.gg/forever/census: a snapshot every night at 23:47 UTC with the history of all snapshots. Characters
  are found through guild rosters (about 96 % carry a guild tag), so the sample leans to active players; a character
  shows its state at its last logout, up to a day old.
- forever.raider.io/population: more characters (about 1.7x on EU PvP Horde), levels "as of last sync" (time not
  given), no level history; the history here is whatever this module has fetched before.

update(path, cuts) fetches what is older than max_age_h into a JSON cache (history kept) and returns the cache;
payload(cache, cuts) is the compact part the page needs (DATA.census). A cut is (region, ruleset, faction) like
('eu', 'pvp', 'horde'); cuts_for() makes them from rulesets like "pvp-eu-horde" or "PvP-EU-Horde".
Only the Python standard library. Run by hand: python census.py [pvp-eu-horde ...] prints the comparison.
"""
import json, os, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

UA = {'User-Agent': 'Mozilla/5.0 (compatible; census-reader/1.0)', 'Accept': 'application/json, text/html'}
CA = 'https://classicarmory.gg/api/forever/census'
RIO = 'https://forever.raider.io/population'
CA_RULESET = {'normal': 'normal', 'pvp': 'pvp', 'rp': 'roleplay', 'pvp-rp': 'roleplay-pvp'}
RIO_CLASS = {1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest', 7: 'Shaman', 8: 'Mage', 9: 'Warlock', 11: 'Druid'}
KEEP = 90   # dated entries kept per source and cut


def cuts_for(rulesets, both_factions=True):
    """["pvp-eu-horde"] -> [('eu', 'pvp', 'horde'), ('eu', 'pvp', 'alliance')]; unknown names are skipped."""
    rs = {'pvp': 'pvp', 'pve': 'normal', 'normal': 'normal', 'rp': 'rp', 'rppvp': 'pvp-rp', 'pvprp': 'pvp-rp'}
    out = []
    for r in rulesets:
        m = re.fullmatch(r'(pvp|pve|normal|rp|rppvp|pvprp)-(eu|us)-(horde|alliance)', (r or '').lower())
        if not m:
            continue
        for f in ([m[3], 'alliance' if m[3] == 'horde' else 'horde'] if both_factions else [m[3]]):
            c = (m[2], rs[m[1]], f)
            if c not in out:
                out.append(c)
    return out


def key(cut):
    return '-'.join(cut)


def _get(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read().decode('utf-8')


def fetch_ca(cut):
    """Classic Armory: every snapshot (levels 10..60 per day) and class x level of the newest one."""
    region, ruleset, faction = cut
    q = f'?region={region}&ruleset={CA_RULESET[ruleset]}&faction={faction}'
    s = json.loads(_get(CA + '/series' + q))
    lo = s.get('minLevel', 10)
    series = []
    for d in s['days']:
        day = datetime.strptime(str(d['day']), '%Y%m%d').replace(tzinfo=timezone.utc)
        lv = [0] * lo + list(d['levels'])          # index = level
        series.append(dict(day=str(d['day']), at=int((day - timedelta(minutes=13)).timestamp()),   # 23:47 UTC the night before
                           n=d['n'], guilded=d.get('guilded'), levels=lv[:61] + [0] * (61 - len(lv[:61]))))
    cls = {}
    if series:
        d = json.loads(_get(CA + f"/day/{series[-1]['day']}" + q))
        for r in d.get('classLevel', []):
            if 0 <= r['level'] <= 60:
                cls.setdefault(r['class'], [0] * 61)[r['level']] += r['present']
    return dict(series=series, classes=cls)


def fetch_rio(cut):
    """Raider.IO: levels 1..60 per class, as of the site's last sync; dated with the time we fetched it."""
    region, ruleset, faction = cut
    html = _get(f'{RIO}/{region}/{ruleset}?faction={faction}')
    i = html.index('__RIO_INITIAL_DATA')
    raw, _ = json.JSONDecoder().raw_decode(html[html.index('"', i):])
    st = json.loads(raw)['population']['stats']
    cls, lv = {}, [0] * 61
    for c in st.get('classLevels', []):
        arr = [0] + list(c['levels'])[:60]
        cls[RIO_CLASS.get(c['classId'], str(c['classId']))] = arr + [0] * (61 - len(arr))
        for l, v in enumerate(arr):
            lv[l] += v
    return dict(at=int(time.time()), week=st.get('week'), levels=lv, classes=cls)


def update(path, cuts, max_age_h=12, log=print):
    """Fetches every source/cut older than max_age_h; returns (cache, changed)."""
    try:
        cache = json.load(open(path, encoding='utf-8'))
    except (OSError, ValueError):
        cache = {}
    changed = False
    for cut in cuts:
        c = cache.setdefault(key(cut), {})
        ca = c.get('ca') or {}
        if time.time() - ca.get('fetched', 0) > max_age_h * 3600:
            try:
                new = fetch_ca(cut)
                if [x['day'] for x in new['series']] != [x['day'] for x in ca.get('series', [])] or not ca:
                    changed = True
                old = {x['day']: x for x in ca.get('series', [])}   # keep snapshots the site might drop later
                old.update({x['day']: x for x in new['series']})
                c['ca'] = dict(fetched=int(time.time()), series=[old[d] for d in sorted(old)][-KEEP:], classes=new['classes'] or ca.get('classes', {}))
            except Exception as e:
                log(f'Census Classic Armory {key(cut)}: {e}')
        rio = c.get('rio') or {}
        hist = rio.get('history', [])
        if not hist or time.time() - hist[-1]['at'] > max_age_h * 3600:
            try:
                new = fetch_rio(cut)
                if not hist or new['levels'] != hist[-1]['levels']:
                    hist.append(new)
                    changed = True
                else:
                    hist[-1]['at'] = new['at']   # unchanged data: only note that it is still current
                c['rio'] = dict(history=hist[-KEEP:])
            except Exception as e:
                log(f'Census Raider.IO {key(cut)}: {e}')
    if changed or cuts:
        tmp = path + '.tmp'
        json.dump(cache, open(tmp, 'w', encoding='utf-8'))
        os.replace(tmp, path)
    return cache, changed


def payload(cache, cuts):
    """DATA.census for the page: per cut the level counts (index = level) of every dated entry and the newest classes."""
    out = {}
    for cut in cuts:
        c = cache.get(key(cut)) or {}
        e = {}
        if c.get('ca', {}).get('series'):
            e['ca'] = dict(series=[dict(at=x['at'], n=x['n'], g=x.get('guilded'), lv=x['levels']) for x in c['ca']['series']],
                           cls=c['ca'].get('classes', {}))
        if c.get('rio', {}).get('history'):
            h = c['rio']['history']
            e['rio'] = dict(series=[dict(at=x['at'], n=sum(x['levels']), lv=x['levels']) for x in h], cls=h[-1]['classes'], week=h[-1].get('week'))
        if e:
            out[key(cut)] = e
    return out


def stats(levels, lo=10):
    n = sum(levels[lo:])
    if not n:
        return None
    acc, q, mean = 0, {}, 0
    for l in range(60, lo - 1, -1):   # fastest first: level the fastest share x has reached
        acc += levels[l]
        for s in (0.01, 0.05, 0.1, 0.25, 0.5):
            if s not in q and acc >= s * n:
                q[s] = l
    mean = sum(l * levels[l] for l in range(lo, 61)) / n
    share = lambda t: sum(levels[t:]) / n
    return dict(n=n, mean=round(mean, 1), top1=q[0.01], top5=q[0.05], top10=q[0.1], top25=q[0.25], median=q[0.5],
                ge30=round(100 * share(30), 1), ge40=round(100 * share(40), 1), ge50=round(100 * share(50), 2), at60=levels[60])


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    cuts = cuts_for(sys.argv[1:] or [json.load(open(os.path.join(here, 'config.json'), encoding='utf-8')).get('ruleset', 'pvp-eu-horde')])
    cache, changed = update(os.path.join(here, 'census.json'), cuts)
    for cut in cuts:
        c = cache.get(key(cut), {})
        if c.get('ca'):
            x = c['ca']['series'][-1]
            print(key(cut), 'Classic Armory', datetime.fromtimestamp(x['at']).strftime('%d.%m. %H:%M'), stats(x['levels']))
        if c.get('rio'):
            x = c['rio']['history'][-1]
            print(key(cut), 'Raider.IO     ', datetime.fromtimestamp(x['at']).strftime('%d.%m. %H:%M'), stats(x['levels']))
