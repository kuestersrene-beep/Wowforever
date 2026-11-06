"""Reads auction house prices from the SavedVariables files of the AH add-ons members use.

    AuctionDB.lua        AuctionDB, WoW Forever edition (MooreaTV): full scans of the whole AH every 15 min,
                         per item min / median / quantity per scan for the last days, daily rollups for 180 days.
    Auctionator.lua      Auctionator: per item the current min price and one price + quantity per day. Since
                         database version 8 every realm is a CBOR-encoded string instead of a Lua table.
    Blackthornes_TS.lua  Tradeskills: per item the last reading plus a short history.
    aux-addon.lua        aux: per realm and faction the lowest buyout of the current day and up to 11 older daily
                         values per item; no quantities.

read(raw_bytes, faction) -> Prices with scans (one row per item and scan time) and history (older points), only for
the auction house of that faction ("Horde" / "Alliance"; None = all). Only data is parsed, nothing is executed.
One kind of price for every add-on: "market" is the lowest unit buyout (what you pay right now), because Auctionator
and aux only know that one; mixing it with AuctionDB's median would make prices jump between uploads.
Used by ah/snapshot.py (own scans) and by the website's scan worker (members' uploads).
"""
import struct

import lua_sv

# Auctionator counts days from 2020-01-01 UTC (Auctionator.Constants.SCAN_DAY_0); a real file confirms it
# (day 2300 = April 2026)
AUCTIONATOR_DAY0 = 1577836800
DAY = 86400


class Prices:
    def __init__(self):
        self.scans, self.history, self.sources, self.errors = {}, {}, [], []

    def scan(self, realm, item_id, seen, market, min_price, quantity, scans=None):
        self.scans[(item_id, seen)] = (realm, item_id, seen, market, min_price, quantity, scans)

    def point(self, realm, item_id, t, market, quantity):
        self.history[(item_id, t)] = (realm, item_id, t, market, quantity)


def num(v):
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def text(s):
    """Lua strings come back as latin-1 (byte for byte); realm names are UTF-8 in the file."""
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


# ---------- CBOR (RFC 8949), as much as Auctionator writes ----------
def cbor(data):
    pos = 0

    def head():
        nonlocal pos
        b = data[pos]
        pos += 1
        major, info = b >> 5, b & 31
        if info < 24:
            return major, info, info
        size = {24: 1, 25: 2, 26: 4, 27: 8}.get(info)
        if size is None:
            raise ValueError(f'CBOR: unsupported length {info}')
        v = int.from_bytes(data[pos:pos + size], 'big')
        pos += size
        return major, info, v

    def item(depth=0):
        nonlocal pos
        if depth > 64:
            raise ValueError('CBOR: too deep')
        major, info, v = head()
        if major == 0:
            return v
        if major == 1:
            return -1 - v
        if major in (2, 3):
            s = data[pos:pos + v]
            pos += v
            return s.decode('utf-8', errors='replace')
        if major == 4:
            return [item(depth + 1) for _ in range(v)]
        if major == 5:
            out = {}
            for _ in range(v):
                k = item(depth + 1)
                out[k] = item(depth + 1)
            return out
        if major == 6:  # tag: ignore, keep the value
            return item(depth + 1)
        if info == 20:
            return False
        if info == 21:
            return True
        if info in (22, 23):
            return None
        if info == 25:
            return struct.unpack('>e', v.to_bytes(2, 'big'))[0]
        if info == 26:
            return struct.unpack('>f', v.to_bytes(4, 'big'))[0]
        if info == 27:
            return struct.unpack('>d', v.to_bytes(8, 'big'))[0]
        raise ValueError(f'CBOR: unsupported simple value {info}')

    return item()


# ---------- the three add-ons ----------
def from_tradeskills(db, faction, out):
    """prices[realm][item] = {seen, market, min, quantity, history = {{t, m, q}}}; realm keys like "Realm-Horde"."""
    prices = {r: t for r, t in (db.get('prices') or {}).items() if isinstance(t, dict)}
    if faction and any(str(r).endswith(('-Horde', '-Alliance')) for r in prices):
        prices = {r: t for r, t in prices.items() if str(r).endswith('-' + faction)}
    for realm, table in prices.items():
        realm = text(str(realm))
        for item_id, rec in table.items():
            if not isinstance(rec, dict) or not isinstance(item_id, int):
                continue
            if rec.get('seen'):
                low = num(rec.get('min')) or num(rec.get('market'))
                out.scan(realm, item_id, int(rec['seen']), low, low, num(rec.get('quantity')), num(rec.get('scans')))
            for p in lua_sv.as_list(rec.get('history')):
                if isinstance(p, dict) and p.get('t'):
                    out.point(realm, item_id, int(p['t']), num(p.get('m')), num(p.get('q')))
        out.sources.append(f'Tradeskills {realm}')
    # scans other guild members shared through the add-on: guildPrices[realm][item] = {sender, time, lowest buyout,
    # second value, sender, ...} (the lowest buyout matches the own scans; no quantities)
    for realm, table in (db.get('guildPrices') or {}).items():
        if not isinstance(table, dict) or (faction and str(realm).endswith(('-Horde', '-Alliance')) and not str(realm).endswith('-' + faction)):
            continue
        realm, n = text(str(realm)), 0
        for item_id, rec in table.items():
            vals = lua_sv.as_list(rec)
            if not isinstance(item_id, int):
                continue
            for i in range(0, len(vals) - 3, 4):
                t, low = vals[i + 1], num(vals[i + 2])
                if isinstance(t, (int, float)) and low:
                    out.scan(realm, item_id, int(t), low, low, None, None)
                    n += 1
        if n:
            out.sources.append(f'Tradeskills Gilde {realm}')


def from_auctiondb(sv, faction, out):
    """houses[faction] = {items = {[id] = "ts,min,median,qty ..."} (every full scan of the last days),
    daily = {[id] = "ts,min,median,qty,scans ..."} (older days)}. Houses are per faction, no realm stored."""
    houses = {h: v for h, v in (sv.get('houses') or {}).items() if isinstance(v, dict) and (not faction or h == faction)}
    for name, house in houses.items():
        for key in ('items', 'daily'):
            for item_id, entries in (house.get(key) or {}).items():
                if not isinstance(item_id, int) or not isinstance(entries, str):
                    continue
                for entry in entries.split():
                    v = [int(float(x)) if x else 0 for x in entry.split(',')]
                    if len(v) < 4 or not v[0]:
                        continue
                    ts, low, median, qty = v[:4]
                    if key == 'items':
                        out.scan(name, item_id, ts, low or median or None, low or median or None, qty)
                    else:
                        out.point(name, item_id, ts, low or median or None, qty)
        out.sources.append(f'AuctionDB {name}')


def from_auctionator(db, faction, out):
    """["Realm Faction"] = {[itemKey] = {m = current min price, l / h = {[day] = lowest / highest price that day},
    a = {[day] = quantity available}}}, a Lua table or (database version 8+) a CBOR string. Only plain item IDs."""
    for realm, table in db.items():
        if not isinstance(realm, str) or realm.startswith('__'):
            continue
        # WoW Forever's Auctionator keys the data by ruleset alone ("PvP"), without a faction: then it belongs to the
        # auction house the uploader chose; only a key naming another faction is skipped
        side = realm.rsplit(' ', 1)[-1] if ' ' in realm else ''
        if faction and side in ('Horde', 'Alliance', 'Neutral') and side != faction:
            continue
        if isinstance(table, str):
            try:
                table = cbor(table.encode('latin-1'))
            except (ValueError, IndexError, struct.error, UnicodeEncodeError):
                out.errors.append(f'Auctionator-Daten von {text(realm)} sind beschädigt (Datei unverändert hochladen)')
                continue
        if not isinstance(table, dict):
            continue
        realm = text(realm)
        n = 0
        for key, rec in table.items():
            item_id = key if isinstance(key, int) else int(key) if isinstance(key, str) and key.isdigit() else None
            if not item_id or not isinstance(rec, dict):
                continue
            low, high, avail = rec.get('l') or {}, rec.get('h') or {}, rec.get('a') or {}
            day_price = {}
            for src in (high, low):  # lowest price of the day wins where both exist
                if isinstance(src, dict):
                    for d, p in src.items():
                        d = int(d) if isinstance(d, str) and d.isdigit() else d
                        if isinstance(d, int) and num(p):
                            day_price[d] = num(p)
            avail = {int(d) if isinstance(d, str) and d.isdigit() else d: q for d, q in avail.items()} \
                if isinstance(avail, dict) else {}
            for d, p in day_price.items():
                out.point(realm, item_id, AUCTIONATOR_DAY0 + d * DAY + DAY // 2, p, num(avail.get(d)))
            if day_price and num(rec.get('m')):
                d = max(day_price)
                out.scan(realm, item_id, AUCTIONATOR_DAY0 + d * DAY + DAY // 2, num(rec['m']), num(rec['m']),
                         num(avail.get(d)))
            n += 1
        if n:
            out.sources.append(f'Auctionator {realm}')


def from_aux(db, faction, out):
    """faction["Realm|Faction"].history["itemID:suffixID"] = "nextPush#dailyMinBuyout#value@time;value@time...":
    the lowest unit buyout of the running day (it is stored as a daily point at nextPush, the end of that day) and
    the older daily values. Random-suffix gear (suffix other than 0) is skipped."""
    for key, data in (db.get('faction') or {}).items():
        if not isinstance(key, str) or not isinstance(data, dict) or (faction and not key.endswith('|' + faction)):
            continue
        realm = text(key).replace('|', ' ')
        n = 0
        for item_key, entry in (data.get('history') or {}).items():
            if not isinstance(item_key, str) or not isinstance(entry, str):
                continue
            item_id, _, suffix = item_key.partition(':')
            if not item_id.isdigit() or suffix not in ('', '0'):
                continue
            item_id = int(item_id)
            push, daily_min, points = (entry.split('#') + ['', '', ''])[:3]
            for point in points.split(';'):
                value, _, t = point.partition('@')
                if value and t.isdigit():
                    out.point(realm, item_id, int(t), int(float(value)), None)
            if push.isdigit() and daily_min:
                price = int(float(daily_min))
                out.scan(realm, item_id, int(push) - DAY // 2, price, price, None)
            n += 1
        if n:
            out.sources.append(f'aux {realm}')


FORMATS = (('BlackthornesTSDB', from_tradeskills), ('AuctionDBForeverSaved', from_auctiondb),
           ('AUCTIONATOR_PRICE_DATABASE', from_auctionator), ('aux', from_aux))


def read(raw, faction=None):
    """Prices of one auction house (faction) from the bytes of a SavedVariables file."""
    sv = lua_sv.loads(raw.decode('latin-1'))  # byte for byte: Auctionator keeps binary data in strings
    # AuctionDB has renamed its variable between versions (AuctionDBForeverSaved, ...): any AuctionDB* with houses
    for name, v in list(sv.items()):
        if name.startswith('AuctionDB') and name != 'AuctionDBForeverSaved' and isinstance(v, dict) and 'houses' in v:
            sv.setdefault('AuctionDBForeverSaved', v)
    known = [(name, fn) for name, fn in FORMATS if isinstance(sv.get(name), dict)]
    if not known:
        raise ValueError('keine Daten von AuctionDB, Auctionator, aux oder Tradeskills in der Datei')
    out = Prices()
    for name, fn in known:
        fn(sv[name], faction, out)
    if not out.scans and not out.history:
        raise ValueError('; '.join(out.errors) or f'keine Preise für {faction or "dieses Auktionshaus"} in der Datei')
    return out
