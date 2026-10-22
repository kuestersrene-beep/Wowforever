import DiscordIcon from "./DiscordIcon";
import { discordUserUrl } from "@/lib/discordUrl";

// Name mit Discord-Icon davor; ein Klick öffnet das Discord-Profil der
// Person (von dort aus mit einem Klick auf "Nachricht" eine DM starten -
// siehe Kommentar bei discordUserUrl() in lib/discordUrl.ts).
export default function DiscordNameLink({
  discordId,
  name,
  className = "",
}: {
  discordId: string | null;
  name: string;
  className?: string;
}) {
  if (!discordId) {
    return <span className={className}>{name}</span>;
  }

  return (
    <a
      href={discordUserUrl(discordId)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 hover:underline ${className}`}
    >
      <DiscordIcon className="h-3.5 w-3.5 shrink-0 text-[#5865F2]" />
      {name}
    </a>
  );
}
