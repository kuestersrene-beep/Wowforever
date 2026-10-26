// Eigene Datei, damit Client Components (z. B. DiscordNameLink) den Link
// importieren können, ohne den serverseitigen Webhook-Code aus
// lib/discord.ts mitzuziehen.

// Discord bietet keine öffentlich dokumentierte "DM direkt öffnen"-URL
// ohne Bot. Dieser Link zum Profil ist die zuverlässigste Variante ohne
// eigenen Bot: Discord öffnet (App oder Web) die Profilkarte der Person,
// von der aus man mit einem Klick auf "Nachricht" den Chat startet.
export function discordUserUrl(discordId: string): string {
  return `https://discord.com/users/${discordId}`;
}
