import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import type { Dictionary } from "@/lib/i18n";
import { formatEventDate, formatRoleCounts, formatSignedUp } from "@/lib/i18n/format";
import { ROLES } from "@/lib/constants";
import { summarizeSignups } from "@/lib/events";
import SignupForm from "@/components/events/SignupForm";
import RosterButtons from "@/components/events/RosterButtons";
import EventAdminActions from "@/components/events/EventAdminActions";
import EventEditToggle from "@/components/events/EventEditToggle";
import Emblem from "@/components/ui/Emblem";
import type { Character, EventSignupRow, GuildEvent } from "@/lib/types";

export default async function TerminDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const admin = (await isAdmin(getDiscordId(user)));
  const locale = await getLocale();
  const dict = await loadDictionary(locale);

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle<GuildEvent>();

  if (!event) {
    notFound();
  }

  const [{ data: signupRows }, { data: myCharacters }] = await Promise.all([
    supabase
      .from("event_signups_overview")
      .select("*")
      .eq("event_id", id)
      .order("updated_at", { ascending: true })
      .returns<EventSignupRow[]>(),
    supabase
      .from("characters")
      .select("*")
      .eq("user_id", user.id)
      .order("is_main", { ascending: false })
      .order("name", { ascending: true })
      .returns<Character[]>(),
  ]);

  const signups = signupRows ?? [];
  const summary = summarizeSignups(signups);
  const mine = signups.find((s) => s.user_id === user.id) ?? null;

  const active = signups.filter((s) => s.status !== "abgemeldet");
  const confirmed = active.filter((s) => s.roster_slot === "bestaetigt");
  const bench = active.filter((s) => s.roster_slot === "bank");
  const open = active.filter((s) => !s.roster_slot);
  const declined = signups.filter((s) => s.status === "abgemeldet");

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{event.title}</h1>
        <Link href="/termine" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>

      <section className="panel flex flex-col gap-1 p-4">
        <p className="text-parchment">
          {formatEventDate(locale, event.starts_at)}
          {event.instance && <span className="text-slate-400"> · {event.instance}</span>}
        </p>
        <p className="text-sm text-slate-400">
          {formatSignedUp(dict, summary.in, event.max_size)} ·{" "}
          {formatRoleCounts(dict, summary.byRole.tank, summary.byRole.heiler, summary.byRole.dd)}
        </p>
        {event.description && (
          <p className="mt-2 whitespace-pre-line text-sm text-parchment/90">
            {event.description}
          </p>
        )}
      </section>

      {/* key: nach dem Speichern mit den neuen Werten neu aufbauen. */}
      {admin && <EventEditToggle key={JSON.stringify(event)} event={event} />}

      <section className="panel flex flex-col gap-3 p-4">
        <h2 className="font-heading text-base text-gold-light">{dict.events.signupTitle}</h2>
        {(myCharacters ?? []).length === 0 ? (
          <p className="text-sm text-slate-400">
            {dict.events.needCharacter}{" "}
            <Link href="/charaktere" className="text-gold-light underline">
              {dict.nav.toCharacters}
            </Link>
          </p>
        ) : (
          // key: React setzt Formulare mit action nach dem Absenden auf
          // ihre defaultValues zurück - mit neuem key nach jedem Speichern
          // zeigen sie wieder die gespeicherte Anmeldung statt der
          // ursprünglichen Vorauswahl.
          <SignupForm
            key={mine?.updated_at ?? "none"}
            eventId={event.id}
            characters={myCharacters ?? []}
            existing={mine}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-gold-light">
          {dict.events.rosterTitle} ({confirmed.length}/{event.max_size})
        </h2>
        {confirmed.length === 0 ? (
          <p className="text-sm text-slate-500">{dict.events.rosterEmpty}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {ROLES.map((role) => (
              <SignupGroup
                key={role}
                title={dict.labels.role[role]}
                rows={confirmed.filter((s) => s.role === role)}
                admin={admin}
                dict={dict}
              />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <SignupGroup title={dict.events.openTitle} rows={open} admin={admin} dict={dict} />
        <SignupGroup title={dict.events.benchTitle} rows={bench} admin={admin} dict={dict} />
        <SignupGroup title={dict.events.declinedTitle} rows={declined} admin={false} dict={dict} />
      </div>

      {admin && (
        <EventAdminActions eventId={event.id} isSeries={!!event.series_id} />
      )}
    </main>
  );
}

function SignupGroup({
  title,
  rows,
  admin,
  dict,
}: {
  title: string;
  rows: EventSignupRow[];
  admin: boolean;
  dict: Dictionary;
}) {
  return (
    <div className="panel p-4">
      <h3 className="mb-2 flex items-baseline justify-between font-heading text-sm text-gold-light">
        <span>{title}</span>
        <span className="text-xs text-slate-400">{rows.length}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">{dict.events.signupsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((s) => (
            <li key={s.user_id ?? `discord-${s.discord_id}`} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-parchment">{s.character_name}</span>
                <span className="text-xs text-slate-400">
                  {[
                    s.class ? (dict.labels.class[s.class] ?? s.class) : null,
                    s.role ? dict.labels.role[s.role] : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {s.source === "discord" && (
                  <span
                    title={dict.events.viaDiscord}
                    className="rounded border border-[#5865F2]/60 px-1 text-[10px] text-[#9da5f7]"
                  >
                    Discord
                  </span>
                )}
                {s.status === "vorlaeufig" && (
                  <span className="rounded border border-amber-500/50 px-1 text-[10px] text-amber-400">
                    {dict.labels.signupStatus.vorlaeufig}
                  </span>
                )}
              </div>
              {/* Bei Discord-Anmeldungen ist der Name oben schon der
                  Discord-Name - dann hier nur noch den Kommentar zeigen. */}
              {(s.source !== "discord" || s.comment) && (
                <span className="text-xs text-slate-500">
                  {s.source === "discord" ? `„${s.comment}“` : s.display_name}
                  {s.source !== "discord" && s.comment && ` – „${s.comment}“`}
                </span>
              )}
              {admin && (
                <RosterButtons
                  eventId={s.event_id}
                  userId={s.user_id}
                  discordId={s.discord_id}
                  slot={s.roster_slot}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
