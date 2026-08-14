import type { Route } from "next";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { UserName } from "@/components/UserName";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { visibleProblemWhere } from "@/lib/problem-visibility";

export const dynamic = "force-dynamic";

export default async function RecentChangesPage() {
  const [user, t, interfaceLocale] = await Promise.all([
    getCurrentUser(),
    getTranslations(),
    getInterfaceLocale()
  ]);
  const revisions = await prisma.pageRevision.findMany({
    include: { editedBy: true },
    orderBy: { createdAt: "desc" },
    take: 75
  });
  const conceptIds = revisions.filter((item) => item.pageType === "CONCEPT").map((item) => item.pageId);
  const problemIds = revisions.filter((item) => item.pageType === "PROBLEM").map((item) => item.pageId);
  const [concepts, problems] = await Promise.all([
    prisma.concept.findMany({ where: { id: { in: conceptIds } }, select: { id: true, slug: true, title: true } }),
    prisma.problem.findMany({
      where: { id: { in: problemIds }, ...visibleProblemWhere(user) },
      select: { id: true, slug: true, title: true }
    })
  ]);
  const conceptsById = new Map(concepts.map((item) => [item.id, item]));
  const problemsById = new Map(problems.map((item) => [item.id, item]));

  return (
    <ForestPageLayout
      title={t.recentChangesPage.title}
      eyebrow={t.recentChangesPage.eyebrow}
      heroImage="/art/rye.jpg"
      heroAlt="Ivan Shishkin, Rye"
      description={t.recentChangesPage.description}
      meta={<p>{t.recentChangesPage.latestRevisions(revisions.length)}</p>}
    >
      <div className="list-surface">
        {revisions.map((revision) => {
          const page =
            revision.pageType === "CONCEPT" ? conceptsById.get(revision.pageId) : problemsById.get(revision.pageId);
          if (!page) return null;
          const href =
            (revision.pageType === "CONCEPT" ? `/concepts/${page.slug}` : `/problems/${page.slug}`) as Route;

          return (
            <article key={revision.id} className="list-row">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="muted mr-2 text-xs uppercase">
                    {revision.pageType === "CONCEPT" ? t.recentChangesPage.concept : t.recentChangesPage.problem}
                  </span>
                  <Link href={href} className="font-medium underline">
                    {page.title}
                  </Link>
                </div>
                <span className="muted text-xs">{revision.createdAt.toLocaleString(interfaceLocale)}</span>
              </div>
              <p className="mt-1 text-sm">
                {localizeRevisionSummary(revision.editSummary, t.recentChangesPage.summaries) ?? t.recentChangesPage.noSummary}
              </p>
              <p className="muted mt-1 text-xs">
                {revision.editedBy ? <UserName user={revision.editedBy} /> : t.recentChangesPage.unknownUser}
              </p>
            </article>
          );
        })}
      </div>
    </ForestPageLayout>
  );
}

function localizeRevisionSummary(
  summary: string | null,
  labels: Awaited<ReturnType<typeof getTranslations>>["recentChangesPage"]["summaries"]
) {
  if (!summary) return null;
  const normalized = summary.trim().replace(/[.]$/, "").toLowerCase();
  const translations: Record<string, string> = {
    "problem created": labels.problemCreated,
    "problem edited": labels.problemEdited,
    "problem reviewed": labels.problemReviewed,
    "problem translation created": labels.problemTranslationCreated,
    "concept created": labels.conceptCreated,
    "concept edited": labels.conceptEdited,
    "concept marked usable": labels.conceptMarkedUsable,
    "concept marked reviewed": labels.conceptMarkedReviewed,
    "updated title": labels.titleUpdated,
    "updated text": labels.textUpdated,
    "updated linked exercises": labels.linkedExercisesUpdated
  };
  return translations[normalized] ?? summary;
}
