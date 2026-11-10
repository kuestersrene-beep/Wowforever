"""Blizzard Game Data API: whole-auction-house snapshots for gold-radar-worker.

Blizzard publishes every auction of a connected realm about once an hour (namespace e.g. dynamic-forever-eu for WoW
Forever, dynamic-classicann-eu for Classic Anniversary). A target is "namespace:region:realm[:faction]", for example
"forever:eu:pvp:Horde" or "classicann:eu:Spineshatter:Horde". WoW Forever has no realms to choose, only rulesets: there
the third part is the ruleset (pvp, pve, rp, rppvp) and every connected realm of that type counts as its auction house
(ruleset_target() derives it from a gold-radar ruleset like "pvp-eu-horde"). Elsewhere it is a realm name or a
connected-realm id. snapshot() returns per item the lowest and the median unit buyout and the quantity listed, ready
for the tool's scans table. Credentials: BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET (client credentials, develop.battle.net).
"""
import base64, json, re, time, urllib.error, urllib.parse, urllib.request
from email.utils import parsedate_to_datetime


class Client:
    def __init__(self, client_id, secret):
        self.id, self.secret, self.tok, self.tok_until = client_id, secret, None, 0

    def token(self):
        if not self.tok or time.time() > self.tok_until:
            req = urllib.request.Request(
                'https://oauth.battle.net/token', data=b'grant_type=client_credentials', method='POST',
                headers={'Authorization': 'Basic ' + base64.b64encode(f'{self.id}:{self.secret}'.encode()).decode(),
                         'Content-Type': 'application/x-www-form-urlencoded'})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read())
            self.tok, self.tok_until = d['access_token'], time.time() + d.get('expires_in', 3600) - 300
        return self.tok

    def get(self, region, path, ns):
        """(status, json or None, last-modified unix time or None)."""
        q = urllib.parse.urlencode({'namespace': f'dynamic-{ns}-{region}', 'locale': 'en_GB' if region == 'eu' else 'en_US'})
        req = urllib.request.Request(f'https://{region}.api.blizzard.com{path}?{q}',
                                     headers={'Authorization': f'Bearer {self.token()}'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                lm = r.headers.get('Last-Modified')
                return r.status, json.loads(r.read()), int(parsedate_to_datetime(lm).timestamp()) if lm else None
        except urllib.error.HTTPError as e:
            return e.code, None, None


RULESET_TYPES = {'pvp': 'PVP', 'pve': 'NORMAL', 'normal': 'NORMAL', 'rp': 'RP', 'rppvp': 'RPPVP'}
TEST_REALM = re.compile(r'\b(GMSS|Web|Partner)\b')  # Blizzard's internal realms in the Forever namespace


def ruleset_target(ruleset, ns='forever'):
    """"pvp-eu-horde" -> "forever:eu:pvp:Horde"; None for names that are no ruleset (e.g. test-horde)."""
    m = re.fullmatch(r'(pvp|pve|normal|rp|rppvp)-(eu|us)-(horde|alliance)', ruleset)
    return f'{ns}:{m[2]}:{m[1]}:{m[3].title()}' if m else None


def parse_target(text):
    parts = text.split(':')
    if len(parts) < 3:
        raise ValueError(f'Ziel "{text}" nicht verstanden (Form: namespace:region:realm[:faction])')
    return dict(ns=parts[0], region=parts[1], realm=parts[2], faction=parts[3] if len(parts) > 3 else None)


def realm_names(client, region, ns):
    code, data, _ = client.get(region, '/data/wow/realm/index', ns)
    return sorted(r['name'] for r in (data or {}).get('realms', [])) if code == 200 else []


def _connected(client, region, ns, limit=None):
    """[(connected-realm id, its realms)]; LookupError while the namespace has none."""
    code, data, _ = client.get(region, '/data/wow/connected-realm/index', ns)
    if code != 200:
        raise LookupError(f'Realm-Verbünde von {ns}-{region} noch nicht veröffentlicht (Status {code})')
    out = []
    for c in data.get('connected_realms', [])[:limit]:
        cid = int(c['href'].split('/connected-realm/')[1].split('?')[0])
        code, cr, _ = client.get(region, f'/data/wow/connected-realm/{cid}', ns)
        out.append((cid, (cr or {}).get('realms', [])))
    return out


def connected_realms(client, region, ns, realm):
    """([connected-realm ids], [realm names]) for a ruleset (all realms of that type), a realm name or an id."""
    if realm.isdigit():
        return [int(realm)], [realm]
    want = RULESET_TYPES.get(realm.lower())
    ids, names = [], []
    for cid, realms in _connected(client, region, ns):
        if want:
            hit = [r for r in realms if ((r.get('type') or {}).get('type') or '').upper() == want
                   and not TEST_REALM.search(r.get('name', ''))]
        else:
            hit = [r for r in realms if r.get('name', '').lower() == realm.lower() or r.get('slug') == realm.lower()]
        if hit:
            ids.append(cid)
            names += [r.get('name', '?') for r in hit]
    if not ids:
        raise LookupError(f'{"Ruleset" if want else "Realm"} "{realm}" in {ns}-{region} nicht gefunden')
    return ids, names


def auctions(client, region, ns, cid, faction):
    """(auctions, last-modified) of one connected realm; classic flavours have one house per faction."""
    code_idx, idx, _ = client.get(region, f'/data/wow/connected-realm/{cid}/auctions/index', ns)
    houses = (idx or {}).get('auctions', []) if code_idx == 200 else []
    if houses:
        fac = (faction or 'Horde').lower()
        house = next((h for h in houses if fac in (h.get('name') or '').lower()), houses[0])
        code, data, lm = client.get(region, f'/data/wow/connected-realm/{cid}/auctions/{house["id"]}', ns)
        where = f'Haus {house.get("name")}'
    else:  # retail form: one list for the connected realm
        code, data, lm = client.get(region, f'/data/wow/connected-realm/{cid}/auctions', ns)
        where = f'Hausliste Status {code_idx}, Gesamtliste'
    if code != 200 or not data:
        raise LookupError(f'Auktionen von Verbund {cid} nicht verfügbar ({where} Status {code})')
    return data.get('auctions', []), lm


def snapshot(client, target, cids):
    """(time of Blizzard's dump, {item_id: (low unit buyout, median unit buyout, quantity)}, auction count).
    low = bait-safe lowest price (see below). Several connected realms (one ruleset) count as one market."""
    t = parse_target(target)
    every, stamps = [], []
    for cid in cids:
        got, lm = auctions(client, t['region'], t['ns'], cid, t['faction'])
        every += got
        stamps.append(lm or int(time.time()))
    per = {}
    for a in every:
        item = (a.get('item') or {}).get('id')
        qty = a.get('quantity') or 1
        unit = a.get('unit_price') or ((a.get('buyout') or 0) / qty if a.get('buyout') else None)
        if not item or not unit:
            continue
        per.setdefault(item, []).append((unit, qty))
    out = {}
    for item, offers in per.items():
        offers.sort()
        total = sum(q for _, q in offers)
        half, run, median = total / 2, 0, offers[-1][0]
        for unit, q in offers:  # median weighted by quantity
            run += q
            if run >= half:
                median = unit
                break
        # 'lowest price' = the unit at position max(3, 5 % of what is listed): a single bait auction far below the
        # market can't fake it (with fewer than 3 units listed it is the most expensive of them)
        k, run, low = min(total, max(3, -(-total * 5 // 100))), 0, offers[-1][0]
        for unit, q in offers:
            run += q
            if run >= k:
                low = unit
                break
        out[item] = (int(low), int(median), total)
    return max(stamps), out, len(every)
