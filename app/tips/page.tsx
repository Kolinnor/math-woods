import { Prisma } from "@prisma/client";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import type { Route } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { TipsAdminTabs } from "@/components/TipsAdminTabs";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadTips, type TipEntry } from "@/lib/daily-tip";
import { translatedDomainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { problemLinkClass } from "@/lib/problem-link";
import { tipImageObjectPosition, tipImageUrl } from "@/lib/tip-images";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { normalizeSearchText, rankSearchMatches, searchMorphologyVariants } from "@/lib/search-ranking";
import { selectTipProblemTranslations } from "@/lib/tip-problem-translations";

export const dynamic = "force-dynamic";

type TipProblem = Prisma.ProblemGetPayload<{
  include: {
    tags: { include: { tag: true } };
    _count: { select: { attempts: true } };
  };
}>;

type TipProblemLink = {
  tipId: number;
  position: number;
  translationGroupId: string;
};

function tipMatchesQuery(
  tip: TipEntry,
  relatedProblems: TipProblem[],
  query: string,
  domainLabels: Partial<Record<string, string>>
) {
  if (!query) return true;

  const haystack = [
    tip.title,
    tip.body,
    ...relatedProblems.map((problem) => [
      problem.title,
      problem.origin,
      translatedDomainLabel(problem.domain, domainLabels),
      ...problem.tags.map(({ tag }) => tag.name)
    ].join(" "))
  ].join(" ");

  return normalizeSearchText(haystack).includes(normalizeSearchText(query));
}

export default async function TipsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; created?: string; updated?: string; deleted?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();
  const [t, preferredLanguage] = await Promise.all([
    getTranslations(),
    getPreferredContentLanguage()
  ]);

  const { q = "", created, updated, deleted } = await searchParams;
  const query = q.trim();
  const tipRows = await loadTips(preferredLanguage);
  const tipIds = tipRows.map((tip) => tip.id);
  const tipProblemLinks = tipIds.length
    ? await prisma.$queryRaw<TipProblemLink[]>`
        SELECT "tipId", "translationGroupId", "position"
        FROM "TipProblemGroup"
        WHERE "tipId" IN (${Prisma.join(tipIds)})
        ORDER BY "tipId" ASC, "position" ASC
      `
    : [];
  const linkedTranslationGroupIds = [...new Set(tipProblemLinks.map((link) => link.translationGroupId))];
  const linkedProblems = linkedTranslationGroupIds.length
    ? await prisma.problem.findMany({
        where: {
          status: "PUBLISHED",
          listed: true,
          translationGroupId: { in: linkedTranslationGroupIds }
        },
        include: {
          tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
          _count: { select: { attempts: true } }
        }
      })
    : [];
  const tipProblemsByTipId = new Map<number, TipProblem[]>();
  for (const tipId of tipIds) {
    const selectedProblems = selectTipProblemTranslations(
      tipProblemLinks.filter((link) => link.tipId === tipId),
      linkedProblems,
      preferredLanguage
    );
    tipProblemsByTipId.set(tipId, selectedProblems);
  }
  const displayedProblems = [...tipProblemsByTipId.values()].flat();
  const solvedAttempts =
    user && displayedProblems.length
      ? await prisma.problemAttempt.findMany({
          where: {
            userId: user.id,
            status: "SOLVED",
            problem: { translationGroupId: { in: displayedProblems.map((problem) => problem.translationGroupId) } }
          },
          select: { problem: { select: { translationGroupId: true } } }
        })
      : [];
  const solvedGroupIds = new Set(solvedAttempts.map((attempt) => attempt.problem.translationGroupId));
  const solvedIds = new Set(
    displayedProblems.filter((problem) => solvedGroupIds.has(problem.translationGroupId)).map((problem) => problem.id)
  );
  const matchingTips = tipRows.map((tip, index) => ({
    tip,
    index,
    relatedProblems: tipProblemsByTipId.get(tip.id) ?? []
  })).filter(({ tip, relatedProblems }) => tipMatchesQuery(tip, relatedProblems, query, t.home.domainLabels));
  const tips = query
    ? rankSearchMatches(
        matchingTips.map((entry) => ({
          item: entry,
          title: entry.tip.title,
          slug: String(entry.tip.id),
          language: preferredLanguage,
          searchText: [
            entry.tip.body,
            ...entry.relatedProblems.flatMap((problem) => [
              problem.title,
              problem.origin,
              translatedDomainLabel(problem.domain, t.home.domainLabels),
              ...problem.tags.map(({ tag }) => tag.name)
            ])
          ]
        })),
        query,
        preferredLanguage,
        searchMorphologyVariants(query, preferredLanguage),
        (left, right) => left.item.index - right.item.index
      ).map(({ item }) => item)
    : matchingTips;

  return (
    <ForestPageLayout
      title="Tips"
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
      meta={
        <>
          <p>{tips.length ? `${tips.length} tips shown` : "No tips match this search."}</p>
          <p>Visible to admins</p>
        </>
      }
      actions={
        <Link href={"/tips/new" as Route} className="button">
          <Plus size={16} aria-hidden="true" />
          New tip
        </Link>
      }
    >
      <TipsAdminTabs active="library" />

      <LiveSearchForm className="tip-search mb-6">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Search tips</span>
          <input name="q" defaultValue={query} placeholder='Try "invariant", "geometry", or "induction"' />
        </label>
        <button type="submit">Search</button>
      </LiveSearchForm>

      {created && <p className="quality-banner mb-4">Tip created.</p>}
      {updated && <p className="quality-banner mb-4">Tip updated.</p>}
      {deleted && <p className="quality-banner mb-4">Tip deleted.</p>}

      <p className="result-summary" role="status" aria-live="polite">
        {tips.length ? `${tips.length} tips shown` : "No tips match this search."}
      </p>

      <div className="tips-grid">
        {tips.map(({ tip, index, relatedProblems }) => (
          <article key={tip.id} className="tip-card">
            <div className="tip-card-summary">
              <div className="tip-card-image">
                <img
                  src={tipImageUrl(tip.images[0]?.imageUrl ?? tip.imageUrl)}
                  alt=""
                  loading="lazy"
                  style={{
                    objectPosition: tipImageObjectPosition(
                      tip.images[0]?.imagePositionX ?? tip.imagePositionX,
                      tip.images[0]?.imagePositionY ?? tip.imagePositionY
                    )
                  }}
                />
              </div>
              <div className="tip-card-summary-copy">
                <div className="tip-card-actions">
                  <p className="eyebrow">
                    {tip.kind === "METHOD" ? "Method" : "Tip"} {tip.position + 1}
                  </p>
                  <Link href={`/tips/${tip.id}/edit` as Route} className="button secondary">
                    Edit
                  </Link>
                </div>
                {tip.showInMainMenu && <span className="tip-main-menu-badge">Main menu</span>}
                {tip.images.length > 1 && (
                  <span className="muted text-sm">{tip.images.length} daily image variants</span>
                )}
                <h2>
                  <AsyncMarkdownInline markdown={tip.title} />
                </h2>
                <div className="tip-description">
                  <AsyncMarkdownInline markdown={tip.body} />
                </div>
              </div>
            </div>

            <section className="tip-related" aria-labelledby={`tip-${index}-practice`}>
              <div className="tip-related-heading">
                <h3 id={`tip-${index}-practice`}>Try this on the following problems</h3>
                <span>{relatedProblems.length ? `${relatedProblems.length} selected` : "None selected"}</span>
              </div>
              {relatedProblems.length > 0 ? (
                <div className="tip-problem-list">
                  {relatedProblems.map((problem) => (
                    <Link
                      key={problem.id}
                      href={`/problems/${problem.slug}`}
                      className={problemLinkClass("tip-problem-link block", solvedIds.has(problem.id))}
                    >
                      <strong>
                        <AsyncMarkdownInline markdown={problem.title} />
                      </strong>
                      <span className="tip-problem-meta">
                        {translatedDomainLabel(problem.domain, t.home.domainLabels)} /{" "}
                        {problem.difficulty ? `difficulty ${problem.difficulty}/100` : "difficulty not set"} /{" "}
                        {problem._count.attempts} attempts
                      </span>
                      {problem.tags.length > 0 && (
                        <span className="tip-keywords">
                          {problem.tags.slice(0, 4).map(({ tag }) => (
                            <span key={tag.id} className="tag">
                              {tag.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="muted text-sm">No practice problems selected yet.</p>
              )}
            </section>
          </article>
        ))}
      </div>
    </ForestPageLayout>
  );
}
