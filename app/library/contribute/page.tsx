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
    ? { OR: [{ status: LibraryStatus.PENDING_REVIEW }, { createdById: user.id, status: { in: [LibraryStatus.NEEDS_WORK, LibraryStatus.DRAFT] } }] }
    : { createdById: user.id, status: { in: [LibraryStatus.PENDING_REVIEW, LibraryStatus.NEEDS_WORK, LibraryStatus.DRAFT] } };
  const [mathematicians, references, milestones] = await Promise.all([
    prisma.mathematician.findMany({ where, include: { translations: true }, orderBy: { updatedAt: "desc" } }),
    prisma.libraryReference.findMany({ where, include: { translations: true }, orderBy: { updatedAt: "desc" } }),
    prisma.historyMilestone.findMany({ where, include: { translations: true }, orderBy: { updatedAt: "desc" } })
  ]);
  const fr = locale === "fr";
  const entries = [
    ...mathematicians.map((entry) => ({ key: `m-${entry.id}`, href: `/library/mathematicians/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.displayName ?? entry.name, status: entry.status, kind: fr ? "Mathématicien" : "Mathematician", updatedAt: entry.updatedAt })),
    ...references.map((entry) => ({ key: `r-${entry.id}`, href: `/library/references/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.displayTitle ?? entry.canonicalTitle, status: entry.status, kind: fr ? "Référence" : "Reference", updatedAt: entry.updatedAt })),
    ...milestones.map((entry) => ({ key: `h-${entry.id}`, href: `/library/history/${entry.slug}`, title: localizedTranslation(entry.translations, locale)?.title ?? entry.slug, status: entry.status, kind: fr ? "Repère historique" : "Historical milestone", updatedAt: entry.updatedAt }))
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const pendingEntries = entries.filter((entry) => entry.status === LibraryStatus.PENDING_REVIEW);
  const personalEntries = reviewer
    ? entries.filter((entry) => entry.status !== LibraryStatus.PENDING_REVIEW)
    : entries;

  const archivedEntries = admin ? await archivedLibraryEntries(locale) : [];

  function entryList(items: typeof entries, emptyLabel: string) {
    return items.length
      ? items.map((entry) => <Link href={entry.href as never} key={entry.key}><span><small>{entry.kind}</small><strong>{entry.title}</strong></span><LibraryStatusBadge status={entry.status} locale={locale} /></Link>)
      : <p className="muted">{emptyLabel}</p>;
  }

  return (
    <ForestPageLayout title={fr ? "Contribuer à la bibliothèque" : "Contribute to the library"} description={reviewer ? (fr ? "Proposez une fiche ou relisez les contributions en attente." : "Suggest an entry or review pending contributions.") : (fr ? "Vos propositions sont relues avant leur publication." : "Your suggestions are reviewed before publication.")} heroImage="/art/birch-grove.jpg">
      <LibraryTabs active="contribution" locale={locale} />
      <div className="library-contribution-actions">
        <Link href="/library/mathematicians/new"><UsersRound size={20} /><span>{fr ? "Proposer un mathématicien" : "Suggest a mathematician"}</span><Plus size={16} /></Link>
        <Link href="/library/history/new"><Clock3 size={20} /><span>{fr ? "Proposer un repère" : "Suggest a milestone"}</span><Plus size={16} /></Link>
        <Link href="/library/references/new"><BookOpen size={20} /><span>{fr ? "Proposer une référence" : "Suggest a reference"}</span><Plus size={16} /></Link>
      </div>
      {reviewer && <section className="library-review-queue"><h2>{fr ? "À relire" : "Review queue"}</h2>{entryList(pendingEntries, fr ? "Aucune fiche en attente de relecture." : "No entries are awaiting review.")}</section>}
      <section className="library-review-queue"><h2>{reviewer ? (fr ? "Mes brouillons" : "My drafts") : (fr ? "Mes fiches" : "My entries")}</h2>{entryList(personalEntries, fr ? "Aucune fiche à reprendre." : "No entries to resume.")}</section>
      {admin && archivedEntries.length > 0 && <details className="library-review-queue library-archive-list"><summary>{fr ? "Fiches archivées" : "Archived entries"}</summary>{entryList(archivedEntries, "")}</details>}
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
