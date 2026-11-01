"""Blizzard Game Data API: whole-auction-house snapshots for gold-radar-worker.

Blizzard publishes every auction of a connected realm about once an hour (namespace e.g. dynamic-forever-eu for WoW
Forever, dynamic-classicann-eu for Classic Anniversary). A target is "namespace:region:realm[:faction]", for example
"forever:eu:Ashbringer" or "classicann:eu:Spineshatter:Horde"; the realm is a name (or a connected-realm id).
snapshot() returns per item the lowest and the median unit buyout and the quantity listed, ready for the tool's
scans table. Credentials: BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET (client credentials, develop.battle.net).
"""
import base64, json, time, urllib.error, urllib.parse, urllib.request
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


def parse_target(text):
    parts = text.split(':')
    if len(parts) < 3:
        raise ValueError(f'Ziel "{text}" nicht verstanden (Form: namespace:region:realm[:faction])')
    return dict(ns=parts[0], region=parts[1], realm=parts[2], faction=parts[3] if len(parts) > 3 else None)


def realm_names(client, region, ns):
    code, data, _ = client.get(region, '/data/wow/realm/index', ns)
    return sorted(r['name'] for r in (data or {}).get('realms', [])) if code == 200 else []


def connected_realm(client, region, ns, realm):
    """Connected-realm id for a realm name (or the id itself). Raises LookupError with a readable reason."""
    if realm.isdigit():
        return int(realm)
    code, data, _ = client.get(region, '/data/wow/connected-realm/index', ns)
    if code != 200:
        raise LookupError(f'Realm-Verbünde von {ns}-{region} noch nicht veröffentlicht (Status {code})')
    for c in data.get('connected_realms', []):
        cid = int(c['href'].split('/connected-realm/')[1].split('?')[0])
        code, cr, _ = client.get(region, f'/data/wow/connected-realm/{cid}', ns)
        if any(r.get('name', '').lower() == realm.lower() or r.get('slug') == realm.lower() for r in (cr or {}).get('realms', [])):
            return cid
    raise LookupError(f'Realm "{realm}" in {ns}-{region} nicht gefunden')


def snapshot(client, target, cid):
    """(time of Blizzard's dump, {item_id: (min unit buyout, median unit buyout, quantity)}, auction count)."""
    t = parse_target(target)
    code, idx, _ = client.get(t['region'], f'/data/wow/connected-realm/{cid}/auctions/index', t['ns'])
    houses = (idx or {}).get('auctions', []) if code == 200 else []
    if houses:  # classic flavours: one auction house per faction (Alliance, Horde, neutral)
        fac = (t['faction'] or 'Horde').lower()
        house = next((h for h in houses if fac in (h.get('name') or '').lower()), houses[0])
        code, data, lm = client.get(t['region'], f'/data/wow/connected-realm/{cid}/auctions/{house["id"]}', t['ns'])
    else:  # retail form: one list for the connected realm
        code, data, lm = client.get(t['region'], f'/data/wow/connected-realm/{cid}/auctions', t['ns'])
    if code != 200 or not data:
        raise LookupError(f'Auktionen nicht verfügbar (Status {code})')
    per = {}
    for a in data.get('auctions', []):
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
        out[item] = (int(offers[0][0]), int(median), total)
    return lm or int(time.time()), out, len(data.get('auctions', []))
