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
import { getPreferredContentLanguage } from "@/lib/server-language";

export const dynamic = "force-dynamic";

const TIP_MATCHERS = [
  ["hypothesis", "hypotheses", "assumption", "condition", "given", "nonzero", "positive"],
  ["simpler", "small cases", "case", "example", "n=1", "warm-up", "toy"],
  ["backwards", "work backwards", "conclusion", "goal", "equivalent", "from the end"],
  ["small cases", "case", "example", "n=1", "base case", "counterexample"],
  ["invariant", "parity", "coloring", "does not change", "modulo", "congruence"],
  ["geometry", "auxiliary", "triangle", "circle", "cyclic", "similar", "angle"],
  ["contrapositive", "not", "implies", "if and only if", "negation"],
  ["unique", "uniqueness", "exists", "existence", "construct"],
  ["inequality", "equality", "minimum", "maximum", "bound", "extremal"],
  ["notation", "structure", "sequence", "recurrence", "symmetry", "polynomial", "matrix"],
  ["counterexample", "hypothesis", "false", "necessary", "condition"],
  ["divides", "divisibility", "integer", "modulo", "congruence", "multiple"],
  ["symmetry", "symmetric", "swap", "variables", "reflection", "invariant"],
  ["induction", "recursive", "recurrence", "n+1", "base case"],
  ["representation", "geometric", "counting", "generating", "graph", "picture"],
  ["generalize", "generalization", "shorter solution", "alternative", "extension"]
] satisfies string[][];

type TipProblem = Awaited<ReturnType<typeof loadProblems>>[number];

async function loadProblems(language: string) {
  return prisma.problem.findMany({
    where: { status: "PUBLISHED", listed: true, language },
    orderBy: [{ updatedAt: "desc" }],
    take: 180,
    include: {
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      favorites: { select: { userId: true } },
      _count: { select: { attempts: true, favorites: true } }
    }
  });
}

function includesPhrase(text: string, phrase: string) {
  return text.includes(phrase.toLowerCase());
}

function problemScore(problem: TipProblem, phrases: readonly string[]) {
  const title = problem.title.toLowerCase();
  const body = problem.bodyMarkdown.toLowerCase();
  const origin = problem.origin.toLowerCase();
  const tagText = problem.tags.map(({ tag }) => `${tag.name} ${tag.slug}`.toLowerCase()).join(" ");
  let score = 0;

  for (const phrase of phrases) {
    if (includesPhrase(title, phrase)) score += 6;
    if (includesPhrase(tagText, phrase)) score += 5;
    if (includesPhrase(origin, phrase)) score += 2;
    if (includesPhrase(body, phrase)) score += 1;
  }

  return score;
}

function externalFavoriteCount(problem: TipProblem) {
  return problem.favorites.filter((favorite) => favorite.userId !== problem.authorId).length;
}

function relatedProblemsForTip(problems: TipProblem[], tipIndex: number) {
  const phrases = TIP_MATCHERS[tipIndex] ?? [];

  return problems
    .map((problem) => ({ problem, score: problemScore(problem, phrases) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return (
        right.problem._count.attempts +
        externalFavoriteCount(right.problem) -
        left.problem._count.attempts -
        externalFavoriteCount(left.problem)
      );
    })
    .slice(0, 5)
    .map(({ problem }) => problem);
}

function tipMatchesQuery(tip: TipEntry, relatedProblems: TipProblem[], query: string) {
  if (!query) return true;

  const haystack = [
    tip.title,
    tip.description,
    tip.body,
    `level ${tip.level}`,
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
  searchParams: Promise<{ q?: string; updated?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) notFound();

  const preferredLanguage = await getPreferredContentLanguage();
  const { q = "", updated } = await searchParams;
  const query = q.trim();
  const [problems, tipRows] = await Promise.all([loadProblems(preferredLanguage), loadTips()]);
  const solvedAttempts =
    user && problems.length
      ? await prisma.problemAttempt.findMany({
          where: { userId: user.id, status: "SOLVED", problemId: { in: problems.map((problem) => problem.id) } },
          select: { problemId: true }
        })
      : [];
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));
  const tips = tipRows.map((tip, index) => ({
    tip,
    index,
    relatedProblems: relatedProblemsForTip(problems, index)
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
            <span className="tip-level">Level {tip.level}</span>
            <h2>{tip.title}</h2>
            <p className="tip-description">{tip.description}</p>
            <p className="tip-body">{tip.body}</p>

            <section className="tip-related" aria-labelledby={`tip-${index}-practice`}>
              <div className="tip-related-heading">
                <h3 id={`tip-${index}-practice`}>Related problems</h3>
                <span>{relatedProblems.length ? `${relatedProblems.length} suggestions` : "No suggestions yet"}</span>
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
                <p className="muted text-sm">No obvious matching problems yet. Future tags will make this smarter.</p>
              )}
            </section>
          </article>
        ))}
      </div>
    </div>
  );
}
