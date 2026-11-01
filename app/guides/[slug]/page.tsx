import Link from "next/link";
import { notFound } from "next/navigation";
import GuideFrame from "@/components/guides/GuideFrame";
import { GUIDES, getGuide, guideFile } from "@/lib/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guide = getGuide((await params).slug);
  return guide ? { title: `${guide.title} · WoW Forever`, description: guide.description } : {};
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const guide = getGuide((await params).slug);
  if (!guide) notFound();

  return (
    <main className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/guides" className="text-gold-light hover:underline">
          ← Alle Guides
        </Link>
        <a
          href={guideFile(guide.slug)}
          target="_blank"
          rel="noopener"
          className="text-gold-light hover:underline"
        >
          Im eigenen Tab öffnen ↗
        </a>
      </div>
      <GuideFrame src={guideFile(guide.slug)} title={guide.title} />
    </main>
  );
}
