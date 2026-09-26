import { LibraryStatus } from "@prisma/client";
import Link from "next/link";
import { BookOpen, Clock3, Plus, UsersRound } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { LibraryTabs } from "@/components/library/LibraryTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";
import { localizedTranslation } from "@/lib/library-queries";
import { canUseAdminTools, hasTrustedPrivileges } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function LibraryContributePage() {
  const [user, locale] = await Promise.all([requireAdmin(), getInterfaceLocale()]);
  const reviewer = hasTrustedPrivileges(user.role);
  const admin = canUseAdminTools(user);
  const where = reviewer
    ? { OR: [{ status: LibraryStatus.PENDING_REVIEW }, { status: LibraryStatus.PUBLISHED, reviewedAt: null }, { createdById: user.id, status: { in: [LibraryStatus.NEEDS_WORK, LibraryStatus.DRAFT] } }] }
    : { createdById: user.id, status: { in: [LibraryStatus.PENDING_REVIEW, LibraryStatus.NEEDS_WORK, LibraryStatus.DRAFT] } };
  const [mathematicians, references, milestones] = await Promise.all([
    prisma.mathematician.findMany({ where: reviewer ? { OR: [where, { status: LibraryStatus.PUBLISHED, needsReviewAfterEdit: true }] } : where, include: { translations: true }, orderBy: { updatedAt: "desc" } }),
    prisma.libraryReference.findMany({ where, include: { translations: true }, orderBy: { updatedAt: "desc" } }),
    prisma.historyMilestone.findMany({ where, include: { translations: true }, orderBy: { updatedAt: "desc" } })
  ]);
  const fr = locale === "fr";
  const entries = [
    ...mathematicians.map((entry) => ({ key: `m-${entry.id}`, href: `/library/mathematicians/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.displayName ?? entry.name, status: entry.status, needsReviewAfterEdit: entry.needsReviewAfterEdit, kind: fr ? "Mathématicien" : "Mathematician", updatedAt: entry.updatedAt })),
    ...references.map((entry) => ({ key: `r-${entry.id}`, href: `/library/references/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.displayTitle ?? entry.canonicalTitle, status: entry.status, needsReviewAfterEdit: entry.status === "PUBLISHED" && !entry.reviewedAt, kind: fr ? "Référence" : "Reference", updatedAt: entry.updatedAt })),
    ...milestones.map((entry) => ({ key: `h-${entry.id}`, href: `/library/history/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.title ?? entry.slug, status: entry.status, needsReviewAfterEdit: entry.status === "PUBLISHED" && !entry.reviewedAt, kind: fr ? "Repère historique" : "Historical milestone", updatedAt: entry.updatedAt }))
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const pendingEntries = entries.filter((entry) => entry.status === LibraryStatus.PENDING_REVIEW || ("needsReviewAfterEdit" in entry && entry.needsReviewAfterEdit));
  const personalEntries = reviewer
    ? entries.filter((entry) => !pendingEntries.includes(entry))
    : entries;

  const archivedEntries = admin ? await archivedLibraryEntries(locale) : [];

  const dateFormat = new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const kindIcon = (key: string) => key.startsWith("m-") ? <UsersRound size={16} aria-hidden="true" /> : key.startsWith("r-") ? <BookOpen size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />;
  function entryList(items: Array<Omit<(typeof entries)[number], "needsReviewAfterEdit"> & { needsReviewAfterEdit?: boolean }>, emptyLabel: string) {
    return items.length
      ? <ol className="library-link-list library-queue-list">{items.map((entry) => <li key={entry.key} className="library-link-item" data-kind={entry.key.slice(0, 1)}>
        <span className="library-type-icon" data-kind={entry.key.startsWith("h-") ? "history" : entry.key.startsWith("m-") ? "concept" : undefined}>{kindIcon(entry.key)}</span>
        <div><Link className="library-link-title" href={entry.href as never}>{entry.title}</Link><small className="library-link-meta">{entry.kind} · {dateFormat.format(entry.updatedAt)}</small></div>
        <LibraryStatusBadge status={"needsReviewAfterEdit" in entry && entry.needsReviewAfterEdit ? LibraryStatus.PENDING_REVIEW : entry.status} locale={locale} />
      </li>)}</ol>
      : <p className="library-queue-empty">{emptyLabel}</p>;
  }

  return (
    <ForestPageLayout className="library-contribute-page" title={fr ? "Contribuer à la bibliothèque" : "Contribute to the library"} description={fr ? "Publiez une fiche ou relisez les contributions déjà en ligne." : "Publish an entry or review contributions already online."} heroImage="/art/birch-grove.jpg">
      <LibraryTabs active="contribute" locale={locale} />
      <div className="library-contribution-actions">
        <Link href="/library/mathematicians/new" data-room="people"><span className="library-room-icon"><UsersRound size={20} aria-hidden="true" /></span><span><strong>{fr ? "Un mathématicien" : "A mathematician"}</strong><small>{fr ? "Une vie, des œuvres, un héritage." : "A life, works and a legacy."}</small></span><Plus size={18} aria-hidden="true" /></Link>
        <Link href="/library/history/new" data-room="history"><span className="library-room-icon"><Clock3 size={20} aria-hidden="true" /></span><span><strong>{fr ? "Un repère historique" : "A historical milestone"}</strong><small>{fr ? "Une date, une découverte, une publication." : "A date, a discovery, a publication."}</small></span><Plus size={18} aria-hidden="true" /></Link>
        <Link href="/library/references/new" data-room="references"><span className="library-room-icon"><BookOpen size={20} aria-hidden="true" /></span><span><strong>{fr ? "Une référence" : "A reference"}</strong><small>{fr ? "Un livre, un article, une ressource." : "A book, an article, a resource."}</small></span><Plus size={18} aria-hidden="true" /></Link>
      </div>
      <div className="library-queues">
        {reviewer && <section className="library-review-queue"><h2>{fr ? "À relire" : "Review queue"}<span className="library-entry-section-count">{pendingEntries.length}</span></h2>{entryList(pendingEntries, fr ? "Aucune fiche en attente de relecture." : "No entries are awaiting review.")}</section>}
        <section className="library-review-queue"><h2>{reviewer ? (fr ? "Mes brouillons" : "My drafts") : (fr ? "Mes fiches" : "My entries")}<span className="library-entry-section-count">{personalEntries.length}</span></h2>{entryList(personalEntries, fr ? "Aucune fiche à reprendre." : "No entries to resume.")}</section>
      </div>
      {admin && archivedEntries.length > 0 && <details className="library-archive-list"><summary>{fr ? "Fiches archivées" : "Archived entries"}<span className="library-entry-section-count">{archivedEntries.length}</span></summary>{entryList(archivedEntries, "")}</details>}
    </ForestPageLayout>
  );
}

async function archivedLibraryEntries(locale: "en" | "fr") {
  const [mathematicians, references, milestones] = await Promise.all([
    prisma.mathematician.findMany({ where: { status: LibraryStatus.ARCHIVED }, include: { translations: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.libraryReference.findMany({ where: { status: LibraryStatus.ARCHIVED }, include: { translations: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.historyMilestone.findMany({ where: { status: LibraryStatus.ARCHIVED }, include: { translations: true }, orderBy: { updatedAt: "desc" }, take: 50 })
  ]);
  const fr = locale === "fr";
  return [
    ...mathematicians.map((entry) => ({ key: `m-${entry.id}`, href: `/library/mathematicians/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.displayName ?? entry.name, status: entry.status, kind: fr ? "Mathématicien" : "Mathematician", updatedAt: entry.updatedAt })),
    ...references.map((entry) => ({ key: `r-${entry.id}`, href: `/library/references/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.displayTitle ?? entry.canonicalTitle, status: entry.status, kind: fr ? "Référence" : "Reference", updatedAt: entry.updatedAt })),
    ...milestones.map((entry) => ({ key: `h-${entry.id}`, href: `/library/history/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.title ?? entry.slug, status: entry.status, kind: fr ? "Repère historique" : "Historical milestone", updatedAt: entry.updatedAt }))
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
