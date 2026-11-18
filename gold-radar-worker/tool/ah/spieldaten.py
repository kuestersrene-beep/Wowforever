"""Game facts read in game (ah/blackthornes.py writes ah/data/spieldaten.json from the Tradeskills add-on's file):
what vendors charge for reagents, what they pay for items, and the AH deposit. They replace the estimates in
config.json (vendor_kosten, einstellgebuehr); no personal data, so the website's worker uses the same file.

    cfg = spieldaten.apply(cfg)        analyse.py, dashboard.py, plausi.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, 'data', 'spieldaten.json')
MIN_DEPOSITS = 20   # own listings needed before the measured deposit replaces the estimate


def load():
    try:
        return json.load(open(PATH, encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def apply(cfg):
    """config.json with the measured vendor prices and deposit; values typed into config.json stay for items the
    game data does not know. Applying twice changes nothing."""
    s = load()
    if not s or cfg.get('_spieldaten'):
        return cfg
    cfg = dict(cfg)
    buy = s.get('haendler_kauf') or {}
    cfg['vendor_kosten'] = {**cfg.get('vendor_kosten', {}), **{k: v for k, v in buy.items() if not k.startswith('_')}}
    dep = (s.get('einstellgebuehr') or {}).get('12h') or {}
    if dep.get('n', 0) >= MIN_DEPOSITS and dep.get('anteil'):
        cfg['einstellgebuehr'] = dep['anteil']
    cfg['_spieldaten'] = s.get('stand')
    return cfg


def sell_values():
    """item id -> what a vendor pays (copper), as the game shows it."""
    return {k: v for k, v in (load().get('haendler_verkauf') or {}).items() if not k.startswith('_')}
