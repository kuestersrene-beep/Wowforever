import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDictionary, getLocale } from "@/lib/i18n";
import { formatCharacterCount } from "@/lib/i18n/format";
import { ROLES, WOW_CLASSES } from "@/lib/constants";
import CharacterManager from "@/components/CharacterManager";
import Emblem from "@/components/ui/Emblem";
import type { Character, Role } from "@/lib/types";

export default async function CharakterePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const dict = getDictionary(await getLocale());

  const { data: rows } = await supabase
    .from("characters")
    .select("*")
    .order("is_main", { ascending: false })
    .order("name", { ascending: true })
    .returns<Character[]>();

  const all = rows ?? [];
  const mine = all.filter((c) => c.user_id === user.id);

  // Vorausfüllen aus der Umfrage (1. Klassenwahl + Rolle), solange noch
  // kein eigener Charakter existiert.
  let prefill: { class: string; role: Role } | null = null;
  if (mine.length === 0) {
    const { data: response } = await supabase
      .from("responses")
      .select("classes, role")
      .eq("user_id", user.id)
      .maybeSingle<{ classes: string[] | null; role: Role | null }>();
    const firstClass = response?.classes?.[0];
    if (firstClass && (WOW_CLASSES as readonly string[]).includes(firstClass)) {
      prefill = { class: firstClass, role: response?.role ?? "dd" };
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <Emblem className="mx-auto h-14 w-14" />
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.characters.title}</h1>
        <Link href="/" className="text-sm text-gold-light hover:underline">
          {dict.nav.back}
        </Link>
      </div>
      <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90">
        {dict.characters.hint}
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-gold-light">
          {dict.characters.mine}
        </h2>
        <CharacterManager characters={mine} prefill={prefill} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-heading text-lg text-gold-light">
            {dict.characters.roster}
          </h2>
          <span className="text-xs text-slate-400">
            {formatCharacterCount(dict, all.length)}
          </span>
        </div>
        <p className="text-sm text-slate-400">{dict.characters.rosterHint}</p>
        {all.length === 0 ? (
          <p className="text-sm text-slate-500">{dict.characters.rosterEmpty}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {ROLES.map((role) => {
              const inRole = all.filter((c) => c.role === role);
              return (
                <div key={role} className="panel p-4">
                  <h3 className="mb-2 flex items-baseline justify-between font-heading text-sm text-gold-light">
                    <span>{dict.labels.role[role]}</span>
                    <span className="text-xs text-slate-400">{inRole.length}</span>
                  </h3>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {inRole.map((c) => (
                      <li key={c.id} className="flex items-center gap-2">
                        <span className="font-medium text-parchment">{c.name}</span>
                        <span className="text-xs text-slate-400">
                          {dict.labels.class[c.class] ?? c.class}
                        </span>
                        {c.is_main && (
                          <span className="rounded border border-gold/40 px-1 text-[10px] uppercase text-gold">
                            {dict.characters.mainBadge}
                          </span>
                        )}
                        <span className="ml-auto truncate text-xs text-slate-500">
                          {c.display_name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
