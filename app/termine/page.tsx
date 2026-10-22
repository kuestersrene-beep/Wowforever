import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getDictionary, getLocale } from "@/lib/i18n";
import type { Dictionary, Locale } from "@/lib/i18n";
import { formatEventDate, formatRoleCounts, formatSignedUp } from "@/lib/i18n/format";
import { summarizeSignups, UPCOMING_GRACE_MS } from "@/lib/events";
import EventForm from "@/components/events/EventForm";
import Emblem from "@/components/ui/Emblem";
import type { EventSignupRow, GuildEvent } from "@/lib/types";

export default async function TerminePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const admin = isAdmin(getDiscordId(user));
  const locale = await getLocale();
  const dict = getDictionary(locale);

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .order("starts_at", { ascending: true })
    .returns<GuildEvent[]>();

  const cutoff = Date.now() - UPCOMING_GRACE_MS;
  const upcoming = (events ?? []).filter((e) => new Date(e.starts_at).getTime() >= cutoff);
  const past = (events ?? [])
    .filter((e) => new Date(e.starts_at).getTime() < cutoff)
    .reverse()
    .slice(0, 10);

  const shownIds = [...upcoming, ...past].map((e) => e.id);
  const { data: signupRows } = shownIds.length
    ? await supabase
        .from("event_signups_overview")
        .select("*")
        .in("event_id", shownIds)
        .returns<EventSignupRow[]>()
    : { data: [] as EventSignupRow[] };

  const signupsByEvent = new Map<string, EventSignupRow[]>();
  for (const s of signupRows ?? []) {
    signupsByEvent.set(s.event_id, [...(signupsByEvent.get(s.event_id) ?? []), s]);
  }

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-20 w-20 sm:h-24 sm:w-24" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.events.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90">
        {dict.events.hint}
      </p>

      {admin && <EventForm />}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-gold-light">{dict.events.upcoming}</h2>
        {upcoming.length === 0 && (
          <p className="text-sm text-slate-500">{dict.events.empty}</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {upcoming.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              signups={signupsByEvent.get(e.id) ?? []}
              userId={user.id}
              dict={dict}
              locale={locale}
            />
          ))}
        </div>
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-lg text-gold-light">{dict.events.past}</h2>
          <div className="grid gap-4 opacity-70 sm:grid-cols-2">
            {past.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                signups={signupsByEvent.get(e.id) ?? []}
                userId={user.id}
                dict={dict}
                locale={locale}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function EventCard({
  event,
  signups,
  userId,
  dict,
  locale,
}: {
  event: GuildEvent;
  signups: EventSignupRow[];
  userId: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const summary = summarizeSignups(signups);
  const mine = signups.find((s) => s.user_id === userId);

  return (
    <Link
      href={`/termine/${event.id}`}
      className="panel flex flex-col gap-2 p-4 transition hover:border-gold/60"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-base text-gold-light">{event.title}</h3>
        <span className="whitespace-nowrap text-xs text-slate-400">
          {formatSignedUp(dict, summary.in, event.max_size)}
        </span>
      </div>
      <p className="text-sm text-parchment">
        {formatEventDate(locale, event.starts_at)}
        {event.instance && <span className="text-slate-400"> · {event.instance}</span>}
      </p>
      <p className="text-xs text-slate-400">
        {formatRoleCounts(dict, summary.byRole.tank, summary.byRole.heiler, summary.byRole.dd)}
      </p>
      <p className="text-xs">
        <span className="text-slate-400">{dict.events.mySignupLabel} </span>
        {mine ? (
          <span className="text-gold-light">
            {dict.labels.signupStatus[mine.status]} ({mine.character_name})
            {mine.roster_slot && ` · ${dict.labels.rosterSlot[mine.roster_slot]}`}
          </span>
        ) : (
          <span className="text-slate-500">{dict.events.notSignedUp}</span>
        )}
      </p>
    </Link>
  );
}
