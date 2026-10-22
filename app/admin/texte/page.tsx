import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDiscordId, isAdmin } from "@/lib/admin";
import { getDictionary } from "@/lib/i18n";
import { loadSiteContent } from "@/lib/content";
import { CONTENT_GROUPS, getByPath } from "@/lib/contentFields";
import ContentEditor, { type EditorField } from "@/components/admin/ContentEditor";

// Admin-Seite "Texte bearbeiten": alle Texte aus lib/contentFields.ts
// mit eingebautem Standardtext und aktueller Änderung je Sprache.
export default async function TextePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(getDiscordId(user))) {
    redirect("/");
  }

  const rows = await loadSiteContent();
  const override = (key: string, locale: string) =>
    rows.find((r) => r.key === key && r.locale === locale)?.value ?? null;

  const groups = CONTENT_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    toggles: (group.toggles ?? []).map((t) => ({
      ...t,
      visible: override(t.key, "all") !== "false",
    })),
    fields: group.fields.map(
      (f): EditorField => ({
        ...f,
        defaults: {
          de: getByPath(getDictionary("de"), f.key) ?? "",
          en: getByPath(getDictionary("en"), f.key) ?? "",
        },
        values: { de: override(f.key, "de"), en: override(f.key, "en") },
      })
    ),
  }));

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-2xl">Texte bearbeiten</h1>
        <Link href="/admin" className="text-sm text-gold-light hover:underline">
          ← Admin-Dashboard
        </Link>
      </div>
      <p className="rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm text-parchment/90">
        Änderungen sind nach dem Speichern sofort auf der Seite sichtbar. Leere
        Felder bzw. „Standard“ zeigen wieder den eingebauten Text. Englische
        Texte sind optional – ohne Änderung gilt die eingebaute Übersetzung.
      </p>
      <ContentEditor groups={groups} />
    </main>
  );
}
