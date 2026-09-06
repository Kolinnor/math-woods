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
import { localizedTranslation, visibleLibraryEntryWhere, searchMathematicians } from "@/lib/library-queries";
import { isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

export default async function LibraryMathematiciansPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const [locale, user, query] = await Promise.all([getInterfaceLocale(), requireAdmin(), searchParams]);
  const q = query.q?.trim().slice(0, 160);
  const where = visibleLibraryEntryWhere(user);
  const matches = await searchMathematicians(q ?? "", locale, where);
  const pagination = libraryPage(query.page, matches.length, PAGE_SIZE);
  const ids = matches.slice(pagination.skip, pagination.skip + pagination.take).map(person => person.id);
  const rows = await prisma.mathematician.findMany({ where: { AND: [where, { id: { in: ids } }] }, include: { translations: true } });
  const entries = rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const copy = libraryCopy[locale];
  const canAdd = isVerifiedContributor(user);

  return (
    <ForestPageLayout title={copy.mathematicians} heroImage="/art/birch-grove.jpg">
      <LibraryTabs active="mathematicians" locale={locale} />
      <form className="library-filter-bar library-filter-bar-single"><input name="q" defaultValue={q} placeholder={locale === "fr" ? "Rechercher un mathématicien" : "Search for a mathematician"} /><button type="submit">{locale === "fr" ? "Rechercher" : "Search"}</button></form>
      {(canAdd || entries.length > 0) && <div className="library-card-grid library-mathematician-grid">
        {canAdd && <Link className="library-card library-add-mathematician" href="/library/mathematicians/new">
          <Plus size={72} strokeWidth={1.5} aria-hidden="true" />
          <span>{copy.addMathematician}</span>
        </Link>}
        {entries.map((entry) => {
        const translation = localizedTranslation(entry.translations, locale);
        return <article className="library-card library-person-card" key={entry.id}>
          {entry.portraitUrl && <div className="library-card-image"><img src={entry.portraitUrl} alt={entry.imageAlt ?? translation?.displayName ?? entry.name} /><ImageCredit credit={entry.imageCredit} creditUrl={entry.imageCreditUrl} license={entry.imageLicense} label={copy.imageCredit} /></div>}
          <div className="library-card-body"><div className="library-card-heading"><h2><Link href={`/library/mathematicians/${entry.slug}`}>{translation?.displayName ?? entry.name}</Link>{translation && <ContentLanguageFallback language={translation.language} expectedLanguage={locale} />}</h2>{entry.status !== "PUBLISHED" && <LibraryStatusBadge status={entry.status} locale={locale} />}</div><p className="library-card-meta">{entry.lifespan}</p>{translation?.teaser && <p>{translation.teaser}</p>}</div>
        </article>;
      })}</div>}
      {!entries.length && <LibraryEmptyState>{copy.noEntries}</LibraryEmptyState>}
      <LibraryPagination pathname="/library/mathematicians" query={{ q }} page={pagination.page} totalPages={pagination.totalPages} locale={locale} />
    </ForestPageLayout>
  );
}
