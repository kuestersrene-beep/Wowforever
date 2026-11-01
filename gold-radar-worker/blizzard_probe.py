"""Does the Blizzard Game Data API deliver WoW Forever auction house data, and under which namespace?

Run on the server (credentials stay there, nothing secret is printed):
    docker compose exec gold-radar-worker python blizzard_probe.py

Needs BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET in .env (develop.battle.net, client credentials). Reads only:
the realm list of every candidate namespace in EU and US, and for realms that look like WoW Forever the auction
house index plus one auction house (how many auctions, which fields). Prints a short report to copy back.
"""
import base64, json, os, sys, urllib.error, urllib.parse, urllib.request

ID, SECRET = os.environ.get('BLIZZARD_CLIENT_ID', ''), os.environ.get('BLIZZARD_CLIENT_SECRET', '')
# known: dynamic (retail), dynamic-classic (progression), dynamic-classic1x (Era), dynamic-classicann (Anniversary);
# the rest are guesses for WoW Forever
KINDS = ['dynamic-classic', 'dynamic-classic1x', 'dynamic-classicann', 'dynamic-forever', 'dynamic-classicforever',
         'dynamic-wowforever', 'dynamic-classic2x', 'dynamic-classicfo', 'dynamic-classicfv', 'dynamic-classicwf']
REGIONS = ['eu', 'us']


def token():
    req = urllib.request.Request('https://oauth.battle.net/token', data=b'grant_type=client_credentials', method='POST',
                                 headers={'Authorization': 'Basic ' + base64.b64encode(f'{ID}:{SECRET}'.encode()).decode(),
                                          'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())['access_token']


def get(tok, region, path, ns, **params):
    q = urllib.parse.urlencode(dict(namespace=f'{ns}-{region}', locale='en_GB' if region == 'eu' else 'en_US', **params))
    req = urllib.request.Request(f'https://{region}.api.blizzard.com{path}?{q}', headers={'Authorization': f'Bearer {tok}'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, None
    except OSError as e:
        return str(e), None


def main():
    if not ID or not SECRET:
        raise SystemExit('BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET fehlen in der .env (danach: docker compose up -d)')
    try:
        tok = token()
    except Exception as e:
        raise SystemExit(f'Anmeldung bei Blizzard fehlgeschlagen ({e}). Client-ID und Secret prüfen.')
    print('Anmeldung bei Blizzard: ok\n')
    candidates = []
    for region in REGIONS:
        for kind in KINDS:
            code, data = get(tok, region, '/data/wow/realm/index', kind)
            if code != 200 or not data:
                print(f'{kind}-{region:3} realm/index: {code}')
                continue
            names = sorted(r['name'] for r in data.get('realms', []))
            print(f'{kind}-{region:3} realm/index: {len(names)} Realms, z. B. {", ".join(names[:8])}')
            forever_like = kind not in ('dynamic-classic', 'dynamic-classic1x', 'dynamic-classicann') or \
                any('forever' in n.lower() for n in names)
            if forever_like:
                candidates.append((region, kind))
    print()
    if not candidates:
        print('Kein Namensraum mit WoW-Forever-Realms gefunden. Bitte diese Ausgabe an Claude geben.')
        return
    for region, kind in candidates:
        code, data = get(tok, region, '/data/wow/connected-realm/index', kind)
        hrefs = [c['href'] for c in (data or {}).get('connected_realms', [])]
        print(f'{kind}-{region}: {len(hrefs)} Realm-Verbünde (connected realms), Status {code}')
        for href in hrefs[:3]:
            cid = href.split('/connected-realm/')[1].split('?')[0]
            code, cr = get(tok, region, f'/data/wow/connected-realm/{cid}', kind)
            names = ', '.join(r['name'] for r in (cr or {}).get('realms', []))
            print(f'  Verbund {cid}: {names or "?"}')
            code, idx = get(tok, region, f'/data/wow/connected-realm/{cid}/auctions/index', kind)
            houses = [(h.get('name'), h.get('id')) for h in (idx or {}).get('auctions', [])]
            print(f'    Auktionshäuser: {code} {houses}')
            for name, hid in houses[:3]:
                code, ah = get(tok, region, f'/data/wow/connected-realm/{cid}/auctions/{hid}', kind)
                auctions = (ah or {}).get('auctions', [])
                sample = auctions[0] if auctions else {}
                print(f'    {name}: Status {code}, {len(auctions)} Auktionen, Felder: {sorted(sample)}')
            if not houses:
                code, ah = get(tok, region, f'/data/wow/connected-realm/{cid}/auctions', kind)
                print(f'    /auctions (Retail-Form): Status {code}, {len((ah or {}).get("auctions", []))} Auktionen')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
