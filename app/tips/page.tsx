import { Prisma } from "@prisma/client";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import type { Route } from "next";
import Link from "next/link";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadTips, type TipEntry } from "@/lib/daily-tip";
import { domainLabel } from "@/lib/domains";
import { canUseAdminTools } from "@/lib/permissions";
import { problemLinkClass } from "@/lib/problem-link";

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
  problemId: number;
};

function tipMatchesQuery(tip: TipEntry, relatedProblems: TipProblem[], query: string) {
  if (!query) return true;

  const haystack = [
    tip.title,
    tip.description,
    ...relatedProblems.map((problem) => [
      problem.title,
      problem.origin,
      domainLabel(problem.domain),
      ...problem.tags.map(({ tag }) => tag.name)
    ].join(" "))
  ].join(" ").toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export default async function TipsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; updated?: string; deleted?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const { q = "", updated, deleted } = await searchParams;
  const query = q.trim();
  const tipRows = await loadTips();
  const tipIds = tipRows.map((tip) => tip.id);
  const tipProblemLinks = tipIds.length
    ? await prisma.$queryRaw<TipProblemLink[]>`
        SELECT "tipId", "problemId", "position"
        FROM "TipProblem"
        WHERE "tipId" IN (${Prisma.join(tipIds)})
        ORDER BY "tipId" ASC, "position" ASC
      `
    : [];
  const linkedProblemIds = [...new Set(tipProblemLinks.map((link) => link.problemId))];
  const linkedProblems = linkedProblemIds.length
    ? await prisma.problem.findMany({
        where: { id: { in: linkedProblemIds }, status: "PUBLISHED", listed: true },
        include: {
          tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
          _count: { select: { attempts: true } }
        }
      })
    : [];
  const linkedProblemsById = new Map(linkedProblems.map((problem) => [problem.id, problem]));
  const tipProblemsByTipId = new Map<number, TipProblem[]>();
  for (const link of tipProblemLinks) {
    const problem = linkedProblemsById.get(link.problemId);
    if (!problem) continue;
    const current = tipProblemsByTipId.get(link.tipId) ?? [];
    current.push(problem);
    tipProblemsByTipId.set(link.tipId, current);
  }
  const solvedAttempts =
    user && linkedProblemIds.length
      ? await prisma.problemAttempt.findMany({
          where: { userId: user.id, status: "SOLVED", problemId: { in: linkedProblemIds } },
          select: { problemId: true }
        })
      : [];
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));
  const tips = tipRows.map((tip, index) => ({
    tip,
    index,
    relatedProblems: tipProblemsByTipId.get(tip.id) ?? []
  })).filter(({ tip, relatedProblems }) => tipMatchesQuery(tip, relatedProblems, query));

  return (
    <div className="directory-page">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold">Tips</h1>
        </div>
      </div>

      <LiveSearchForm className="tip-search mb-6">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Search tips</span>
          <input name="q" defaultValue={query} placeholder='Try "invariant", "geometry", or "induction"' />
        </label>
        <button type="submit">Search</button>
      </LiveSearchForm>

      {updated && <p className="quality-banner mb-4">Tip updated.</p>}
      {deleted && <p className="quality-banner mb-4">Tip deleted.</p>}

      <p className="result-summary" role="status" aria-live="polite">
        {tips.length ? `${tips.length} tips shown` : "No tips match this search."}
      </p>

      <div className="tips-grid">
        {tips.map(({ tip, index, relatedProblems }) => (
          <article key={tip.title} className="tip-card">
            <div className="tip-card-actions">
              <p className="eyebrow">Tip {index + 1}</p>
              <Link href={`/tips/${tip.id}/edit` as Route} className="button secondary">
                Edit
              </Link>
            </div>
            {tip.showInMainMenu && <span className="tip-main-menu-badge">Main menu</span>}
            <h2>{tip.title}</h2>
            <p className="tip-description">{tip.description}</p>

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
                        {domainLabel(problem.domain)} /{" "}
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
    </div>
  );
}
