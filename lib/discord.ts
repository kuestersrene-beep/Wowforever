import {
  FACTION_LABELS,
  PARTICIPATION_LABELS,
  PLAYSTYLE_LABELS,
  ROLE_LABELS,
} from "./constants";
import { formatEventDate } from "./i18n/format";
import { getIconUrl } from "./siteSettings";
import type {
  EventSignupRow,
  Faction,
  GuildEvent,
  Participation,
  Playstyle,
  Role,
} from "./types";

// Nur serverseitig verwenden (Webhook-URL, Logo aus der Datenbank). Der
// Profil-Link für Client Components liegt in lib/discordUrl.ts.
export { discordUserUrl } from "./discordUrl";

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

  await postWebhook(webhookUrl, {
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
  });
}

// Gemeinsamer Versand für alle Webhook-Nachrichten. Fehler werden nur
// geloggt, nie geworfen (siehe Kommentar bei notifyDiscord).
// Ist ein eigenes Logo gesetzt (bevorzugt das Countdown-Logo, siehe
// getIconUrl), wird es als Absenderbild verwendet -
// außer SVG, das Discord als Avatar nicht anzeigen kann.
async function postWebhook(
  webhookUrl: string,
  body: Record<string, unknown>
): Promise<boolean> {
  const logoUrl = await getIconUrl();
  const avatarUrl =
    logoUrl && !new URL(logoUrl).pathname.toLowerCase().endsWith(".svg")
      ? logoUrl
      : undefined;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_url: avatarUrl, ...body }),
    });
    return res.ok;
  } catch (err) {
    console.error("Discord-Webhook fehlgeschlagen:", err);
    return false;
  }
}

function eventFields(event: GuildEvent, repeatWeeks: number) {
  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "Beginn", value: formatEventDate("de", event.starts_at), inline: true },
    { name: "Plätze", value: String(event.max_size), inline: true },
  ];
  if (event.instance) {
    fields.push({ name: "Instanz", value: event.instance, inline: true });
  }
  if (repeatWeeks > 1) {
    fields.push({ name: "Wiederholung", value: `${repeatWeeks} Wochen, wöchentlich`, inline: true });
  }
  return fields;
}

// Kündigt einen neu angelegten Termin (bzw. den ersten Termin einer
// Serie) im Discord-Kanal an.
export async function notifyEventCreated(
  event: GuildEvent,
  repeatWeeks: number
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  await postWebhook(webhookUrl, {
    username: "WoW Forever Termine",
    embeds: [
      {
        title: `Neuer Termin: ${event.title}`,
        description: event.description ?? undefined,
        color: 0xc9a86a,
        fields: eventFields(event, repeatWeeks),
      },
    ],
  });
}

// Postet die aktuelle Aufstellung (bestätigt + Bank) eines Termins.
// Gibt zurück, ob Discord die Nachricht angenommen hat, damit der Admin
// eine Rückmeldung bekommt.
export async function postRoster(
  event: GuildEvent,
  signups: EventSignupRow[]
): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const line = (s: EventSignupRow) =>
    s.class ? `${s.character_name} (${s.class})` : s.character_name;
  const confirmed = signups.filter((s) => s.roster_slot === "bestaetigt");
  const bench = signups.filter((s) => s.roster_slot === "bank");

  const fields = (["tank", "heiler", "dd"] as const).map((role) => {
    const inRole = confirmed.filter((s) => s.role === role);
    return {
      name: `${ROLE_LABELS[role]} (${inRole.length})`,
      value: inRole.map(line).join("\n") || "–",
      inline: true,
    };
  });
  if (bench.length > 0) {
    fields.push({
      name: `Bank (${bench.length})`,
      value: bench.map(line).join("\n"),
      inline: false,
    });
  }

  return postWebhook(webhookUrl, {
    username: "WoW Forever Termine",
    embeds: [
      {
        title: `Aufstellung: ${event.title}`,
        description: formatEventDate("de", event.starts_at),
        color: 0x2e8b57,
        fields,
      },
    ],
  });
}
