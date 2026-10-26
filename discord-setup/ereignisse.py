"""Mehrere Bot-Module können auf dasselbe Discord-Ereignis hören (z. B. on_member_join für das
Mod-Log und die Willkommens-Nachricht).

discord.Client ruft für jedes Ereignis das Attribut on_<ereignis> auf. anmelden() setzt dort einen
Verteiler, der alle angemeldeten Funktionen nacheinander ausführt. Ein Fehler in einem Modul hält
die anderen nicht auf.
"""
import logging

import discord

log = logging.getLogger("gildenbot.ereignisse")


def anmelden(client: discord.Client, name: str, funktion):
    if hasattr(type(client), name):
        log.warning("%s ist bereits im Bot definiert – %s wird nicht angemeldet", name, funktion.__qualname__)
        return
    handler = client.__dict__.setdefault("_ereignis_handler", {})
    if name not in handler:
        handler[name] = []

        async def verteiler(*args, **kwargs):
            for f in list(handler[name]):
                try:
                    await f(*args, **kwargs)
                except Exception:
                    log.exception("Fehler in %s", f.__qualname__)

        setattr(client, name, verteiler)
    handler[name].append(funktion)
