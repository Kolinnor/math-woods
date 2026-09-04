import Link from "next/link";
import { Plus } from "lucide-react";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ImageCredit } from "@/components/library/ImageCredit";
import { LibraryEmptyState } from "@/components/library/LibraryEmptyState";
import { LibraryPagination } from "@/components/library/LibraryPagination";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { libraryPage } from "@/lib/library";
import { libraryCopy } from "@/lib/library-copy";
import { localizedTranslation, visibleLibraryEntryWhere } from "@/lib/library-queries";
import { isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function LibraryMathematiciansPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const q = query.q?.trim();
  const where = { AND: [visibleLibraryEntryWhere(user), q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { fields: { has: q } }, { translations: { some: { OR: [{ displayName: { contains: q, mode: "insensitive" as const } }, { teaser: { contains: q, mode: "insensitive" as const } }] } } }] } : {}] };
  const total = await prisma.mathematician.count({ where });
  const pagination = libraryPage(query.page, total, PAGE_SIZE);
  const entries = await prisma.mathematician.findMany({ where, include: { translations: true }, orderBy: { name: "asc" }, skip: pagination.skip, take: pagination.take });
  const copy = libraryCopy[locale];

  return (
    <ForestPageLayout title={copy.mathematicians} description={locale === "fr" ? "Des parcours, des idées et des liens vers leurs contributions mathématiques." : "Lives, ideas, and links to their mathematical contributions."} heroImage="/art/birch-grove.jpg" actions={user && isVerifiedContributor(user) ? <Link className="primary" href="/library/mathematicians/new"><Plus size={16} />{copy.add}</Link> : undefined}>
      <LibraryTabs active="mathematicians" locale={locale} />
      <form className="library-filter-bar library-filter-bar-single"><input name="q" defaultValue={q} placeholder={locale === "fr" ? "Rechercher un nom ou un domaine" : "Search by name or field"} /><button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button></form>
      {entries.length ? <div className="library-card-grid">{entries.map((entry) => {
        const translation = localizedTranslation(entry.translations, locale);
        return <article className="library-card library-person-card" key={entry.id}>
          {entry.portraitUrl && <div className="library-card-image"><img src={entry.portraitUrl} alt={entry.imageAlt ?? translation?.displayName ?? entry.name} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div>}
          <div className="library-card-body"><div className="library-card-heading"><h2><Link href={`/library/mathematicians/${entry.slug}`}>{translation?.displayName ?? entry.name}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2>{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</div><p className="library-card-meta">{entry.lifespan}</p>{translation?.teaser && <p>{translation.teaser}</p>}{entry.fields.length > 0 && <p className="library-tags">{entry.fields.join(" · ")}</p>}</div>
        </article>;
      })}</div> : <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
      <LibraryPagination pathname="/library/mathematicians" query={{ q }} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
    </ForestPageLayout>
  );
}
