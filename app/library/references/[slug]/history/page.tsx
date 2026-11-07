import Link from "next/link";
import { notFound } from "next/navigation";
import { LibraryPageLayout } from "@/components/library/LibraryPageLayout";
import { RevisionDiff } from "@/components/RevisionDiff";
import { UserName } from "@/components/UserName";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { libraryLanguage } from "@/lib/library";
import { localizedTranslation } from "@/lib/library-queries";
import { canViewLibraryEntry } from "@/lib/permissions";
import { referenceContributorUserSelect } from "@/lib/reference-contributors";

export const dynamic = "force-dynamic";

export default async function ReferencePresentationHistoryPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string; before?: string }>;
}) {
  const [{ slug }, query, user, locale, t] = await Promise.all([
    params, searchParams, getCurrentUser(), getInterfaceLocale(), getTranslations()
  ]);
  const entry = await prisma.libraryReference.findUnique({
    where: { slug },
    select: { id: true, slug: true, canonicalTitle: true, status: true, createdById: true,
      translations: { select: { language: true, displayTitle: true } } }
  });
  if (!entry || !canViewLibraryEntry(user, entry)) notFound();

  const translation = localizedTranslation(entry.translations, libraryLanguage(query.lang ?? locale));
  const language = translation?.language ?? libraryLanguage(query.lang ?? locale);
  const before = Number(query.before);
  const cursor = Number.isSafeInteger(before) && before > 0 ? before : null;
  const revisions = await prisma.libraryReferencePresentationRevision.findMany({
    where: { referenceId: entry.id, language, ...(cursor ? { id: { lt: cursor } } : {}) },
    include: { editedBy: { select: referenceContributorUserSelect } },
    orderBy: { id: "desc" },
    take: 21
  });
  const visibleRevisions = revisions.slice(0, 20);
  const fr = locale === "fr";
  const historyHref = `/library/references/${entry.slug}/history`;
  const pageHref = `/library/references/${entry.slug}?lang=${language}`;

  return <LibraryPageLayout locale={locale} titleBelowHero
    title={fr ? "Historique de la présentation" : "Presentation history"}
    eyebrow={<Link href={pageHref as never}>{translation?.displayTitle ?? entry.canonicalTitle}</Link>}
    actions={<Link href={pageHref as never} className="button secondary">{fr ? "Retour au livre ou à la référence" : "Back to the reference"}</Link>}
  >
    <nav className="library-detail-languages mb-5" aria-label={fr ? "Langue de la présentation" : "Presentation language"}>
      {entry.translations.map(item => <Link key={item.language}
        href={`${historyHref}?lang=${item.language}` as never}
        aria-current={item.language === language ? "page" : undefined}>
        {item.language === "fr" ? "Français" : item.language === "en" ? "English" : item.language}
      </Link>)}
    </nav>
    <div className="grid gap-3">
      {visibleRevisions.length === 0 && <p className="muted">{fr ? "Aucune version enregistrée pour cette présentation." : "No versions recorded for this presentation."}</p>}
      {visibleRevisions.map((revision, index) => <section key={revision.id} className="revision-card panel p-4">
        <h2 className="font-semibold">{revision.isBaseline
          ? (fr ? "Version au début du suivi" : "Version when tracking began")
          : revision.previousMarkdown === null
            ? (fr ? "Création de la présentation" : "Presentation created")
            : (fr ? "Modification de la présentation" : "Presentation edited")}</h2>
        <p className="muted text-sm">
          <time dateTime={revision.createdAt.toISOString()}>{revision.createdAt.toLocaleString(locale)}</time>
          {" · "}{revision.editedBy ? <UserName user={revision.editedBy} /> : (fr ? "Auteur non renseigné" : "Author not recorded")}
        </p>
        {revision.isBaseline && <p className="muted mt-3 text-sm">{fr
          ? "Cette version a été conservée lors de l’activation de l’historique. Les modifications antérieures et leurs auteurs n’ont pas été enregistrés."
          : "This version was saved when history tracking was enabled. Earlier edits and their authors were not recorded."}</p>}
        {revision.previousMarkdown !== null && <RevisionDiff
          beforeMarkdown={revision.previousMarkdown} afterMarkdown={revision.markdown}
          beforeRevisionId={0} revisionId={revision.id} defaultOpen={index === 0}
          labels={{ ...t.historyPage, compareWith: () => fr ? "Voir les modifications" : "View changes" }}
        />}
        <details className="mt-3" open={revision.previousMarkdown === null}>
          <summary>{fr ? "Texte complet de cette version (Markdown)" : "Full text of this version (Markdown)"}</summary>
          <pre className="revision-preview mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded p-3 text-sm">{revision.markdown || (fr ? "Présentation vide." : "Empty presentation.")}</pre>
        </details>
      </section>)}
    </div>
    {(cursor || revisions.length > 20) && <nav className="mt-5 flex flex-wrap gap-3" aria-label={fr ? "Pagination de l’historique" : "History pagination"}>
      {cursor && <Link className="button secondary" href={`${historyHref}?lang=${language}` as never}>{fr ? "Modifications les plus récentes" : "Latest changes"}</Link>}
      {revisions.length > 20 && <Link className="button secondary" href={`${historyHref}?lang=${language}&before=${visibleRevisions[19].id}` as never}>{fr ? "Modifications plus anciennes" : "Older changes"}</Link>}
    </nav>}
  </LibraryPageLayout>;
}
