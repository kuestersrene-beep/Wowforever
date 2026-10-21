import {
  FACTION_LABELS,
  PARTICIPATION_LABELS,
  PLAYSTYLE_LABELS,
  ROLE_LABELS,
} from "./constants";
import type { Faction, Participation, Playstyle, Role } from "./types";

// Discord bietet keine öffentlich dokumentierte "DM direkt öffnen"-URL
// ohne Bot. Dieser Link zum Profil ist die zuverlässigste Variante ohne
// eigenen Bot: Discord öffnet (App oder Web) die Profilkarte der Person,
// von der aus man mit einem Klick auf "Nachricht" den Chat startet.
export function discordUserUrl(discordId: string): string {
  return `https://discord.com/users/${discordId}`;
}

interface NotifyParams {
  name: string;
  avatarUrl: string | null;
  isUpdate: boolean;
  participation: Participation;
  faction: Faction | null;
  playstyle: Playstyle | null;
  classes: string[] | null;
  role: Role | null;
  professions: string[] | null;
}

// Postet eine kurze Zusammenfassung in einen Discord-Kanal, wenn jemand die
// Umfrage beantwortet oder ändert. Nutzt einen einfachen "Incoming
// Webhook" (Server-Einstellungen -> Integrationen -> Webhooks in Discord),
// keinen eigenen Bot. Ohne gesetzte DISCORD_WEBHOOK_URL passiert nichts -
// und ein Fehler hier darf niemals das eigentliche Speichern der Antwort
// verhindern, daher wird jeder Fehler nur geloggt statt geworfen.
export async function notifyDiscord(params: NotifyParams): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const fields: { name: string; value: string; inline: boolean }[] = [
    {
      name: "Teilnahme",
      value: PARTICIPATION_LABELS[params.participation],
      inline: true,
    },
  ];

  if (params.participation !== "nein") {
    if (params.faction) {
      fields.push({
        name: "Fraktion",
        value: FACTION_LABELS[params.faction],
        inline: true,
      });
    }
    if (params.playstyle) {
      fields.push({
        name: "Spielstil",
        value: PLAYSTYLE_LABELS[params.playstyle],
        inline: true,
      });
    }
    if (params.classes && params.classes.length > 0) {
      fields.push({
        name: "Klassen",
        value: params.classes.join(" → "),
        inline: true,
      });
    }
    if (params.role) {
      fields.push({
        name: "Rolle",
        value: ROLE_LABELS[params.role],
        inline: true,
      });
    }
    if (params.professions && params.professions.length > 0) {
      fields.push({
        name: "Berufe",
        value: params.professions.join(" + "),
        inline: true,
      });
    }
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "WoW Forever Umfrage",
        embeds: [
          {
            author: {
              name: params.name,
              icon_url: params.avatarUrl ?? undefined,
            },
            title: params.isUpdate ? "Antwort aktualisiert" : "Neue Antwort",
            color: 0xc9a86a,
            fields,
          },
        ],
      }),
    });
  } catch (err) {
    console.error("Discord-Webhook fehlgeschlagen:", err);
  }
}
