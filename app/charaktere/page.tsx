import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n";
import { loadDictionary } from "@/lib/content";
import RichText from "@/components/RichText";
import { fillTemplate, formatCharacterCount } from "@/lib/i18n/format";
import { setShowFirstName } from "./actions";
import { ROLES, WOW_CLASSES } from "@/lib/constants";
import CharacterManager from "@/components/CharacterManager";
import type { Character, Role } from "@/lib/types";

export default async function CharakterePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const dict = await loadDictionary(await getLocale());

  const { data: rows } = await supabase
    .from("characters")
    .select("*")
    .order("is_main", { ascending: false })
    .order("name", { ascending: true })
    .returns<Character[]>();

  const all = rows ?? [];
  const mine = all.filter((c) => c.user_id === user.id);

  // Vornamen für das Roster - die View liefert ihn nur, wenn die Person ihn freigegeben hat
  const { data: overview } = await supabase
    .from("participants_overview")
    .select("discord_id, first_name")
    .returns<{ discord_id: string; first_name: string | null }[]>();
  const firstNames = new Map((overview ?? []).filter((p) => p.first_name).map((p) => [p.discord_id, p.first_name!]));

  // Eigene Einstellung zum Vornamen (nur wenn einer in der Umfrage steht)
  const { data: own } = await supabase
    .from("responses")
    .select("first_name, show_first_name")
    .eq("user_id", user.id)
    .maybeSingle<{ first_name: string | null; show_first_name: boolean }>();

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
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">{dict.characters.title}</h1>
      </div>
      <RichText
        value={dict.characters.hint}
        className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90"
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-gold-light">
          {dict.characters.mine}
        </h2>
        <CharacterManager characters={mine} prefill={prefill} />
        {own?.first_name && (
          <form
            action={setShowFirstName}
            className="panel flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
          >
            <input type="hidden" name="show" value={own.show_first_name ? "false" : "true"} />
            <span className="text-parchment/90">
              {fillTemplate(own.show_first_name ? dict.characters.firstNameShown : dict.characters.firstNameHidden, {
                name: own.first_name,
              })}
            </span>
            <button
              type="submit"
              className="rounded-md border border-gold-dark px-3 py-1.5 text-gold-light transition hover:bg-gold/10"
            >
              {own.show_first_name ? dict.characters.firstNameHide : dict.characters.firstNameShow}
            </button>
          </form>
        )}
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
                          {firstNames.has(c.discord_id) ? ` (${firstNames.get(c.discord_id)})` : ""}
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
