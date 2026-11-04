"""Gibt allen, die schon auf dem Server sind, aber noch keinen Gildenrang haben, einen Rang.

Gedacht für den Moment nach der Gildenentscheidung: Vorher hatten die Leute bewusst nur Klassen- und
Spielrollen (Fokus auf Bewerbung und Abstimmungen), danach werden alle Mitglied und sehen den
ganzen Server. Wer schon einen Rang hat (Gildenmeister, Offizier, Trial, Gast, ...), bleibt unverändert.

Aufruf:
    python rang_vergeben.py --probelauf          zeigt nur, wer den Rang bekäme
    python rang_vergeben.py                      vergibt "Mitglied"
    python rang_vergeben.py --rang Trial         vergibt einen anderen Rang
"""
import sys
import time

import server_einrichten as s

RAENGE = ("Gildenmeister", "Offizier", "Raidleiter", "Class-Leader", "Raider", "Mitglied", "Trial", "Gast")


def main():
    probelauf = "--probelauf" in sys.argv
    rang = sys.argv[sys.argv.index("--rang") + 1] if "--rang" in sys.argv else "Mitglied"
    s.TOKEN = s.env_lesen()["DISCORD_TOKEN"]
    env = s.env_lesen()
    gid = env.get("GUILD_ID") or s.api("GET", "/users/@me/guilds")[0]["id"]
    rollen = {r["id"]: r["name"] for r in s.api("GET", f"/guilds/{gid}/roles")}
    ziel = next((rid for rid, name in rollen.items() if name == rang), None)
    if not ziel:
        sys.exit(f"Rolle {rang} gibt es auf dem Server nicht.")

    mitglieder = [m for m in s.api("GET", f"/guilds/{gid}/members?limit=1000") if not m["user"].get("bot")]
    ohne_rang = [m for m in mitglieder if not any(rollen.get(r) in RAENGE for r in m["roles"])]
    print(f"{'PROBELAUF – ' if probelauf else ''}{len(ohne_rang)} von {len(mitglieder)} bekommen „{rang}“:")
    for m in ohne_rang:
        name = m.get("nick") or m["user"].get("global_name") or m["user"]["username"]
        if not probelauf:
            s.api("PUT", f"/guilds/{gid}/members/{m['user']['id']}/roles/{ziel}")
            time.sleep(0.3)
        print(f"  {'·' if probelauf else '+'} {name}")
    behalten = [m for m in mitglieder if m not in ohne_rang]
    print(f"Unverändert (haben schon einen Rang): {len(behalten)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
