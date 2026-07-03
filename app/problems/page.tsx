import { MathDomain, Prisma, QualityStatus } from "@prisma/client";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { Heart } from "lucide-react";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { ProblemDomainStrip } from "@/components/ProblemDomainStrip";
import { ProblemFilterBuilder, type ProblemFilterRow } from "@/components/ProblemFilterBuilder";
import { ProblemDifficultyFilter } from "@/components/ProblemDifficultyFilter";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  domainCodeAliases,
  domainDescription,
  domainLabel,
  FLAT_PROBLEM_DOMAIN_OPTIONS,
  parseDomainCode,
  PROBLEM_DOMAIN_FAMILIES,
  PROBLEM_DOMAINS
} from "@/lib/domains";
import { contentLanguageLabel } from "@/lib/languages";
import { pluralize } from "@/lib/pluralize";
import { problemLinkClass } from "@/lib/problem-link";
import { qualityLabel } from "@/lib/quality";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { ensureSlug } from "@/lib/slug";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

const PROBLEMS_PER_PAGE = 40;
type SearchValue = string | string[] | undefined;
type DifficultyRange = {
  value: string;
  label: string;
  min?: number;
  max?: number;
};
type ProgressFilter = "unsolved" | "solved" | "all";

const DIFFICULTY_RANGES: DifficultyRange[] = [
  { value: "", label: "Any difficulty" },
  { value: "1-5", label: "Just started (1-5)", min: 1, max: 5 },
  { value: "6-19", label: "Beginner / High school (6-19)", min: 6, max: 19 },
  { value: "20-39", label: "Intermediate / Undergraduate (20-39)", min: 20, max: 39 },
  { value: "40-64", label: "Advanced / Graduate (40-64)", min: 40, max: 64 },
  { value: "65-84", label: "Expert / Research-ready (65-84)", min: 65, max: 84 },
  { value: "85-100", label: "Professional mathematician (85-100)", min: 85, max: 100 }
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "solved", label: "Most solved" },
  { value: "favorited", label: "Most favorited" },
  { value: "difficulty", label: "Hardest first" },
  { value: "easiest", label: "Easiest first" }
];

function parseProgressFilter(value: string | undefined): ProgressFilter {
  return value === "solved" || value === "all" ? value : "unsolved";
}

function parseDifficultyBound(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : undefined;
}

function parseDifficultyRange(value: string | undefined) {
  return DIFFICULTY_RANGES.find((range) => range.value === value) ?? DIFFICULTY_RANGES[0];
}

function problemsHref(params: Record<string, number | string | string[] | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) query.append(key, item);
      }
      continue;
    }
    if (key === "page" && Number(value) <= 1) continue;
    query.set(key, String(value));
  }

  const serialized = query.toString();
  return serialized ? `/problems?${serialized}` : "/problems";
}

function valuesOf(value: SearchValue) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function difficultyColor(difficulty: number | null) {
  if (!difficulty) return "#8a9184";
  if (difficulty <= 19) return "#5d7a4c";
  if (difficulty <= 39) return "#a07a2c";
  if (difficulty <= 64) return "#b05f2c";
  return "#8c3b22";
}

function difficultyBars(difficulty: number | null) {
  if (!difficulty) return 0;
  if (difficulty <= 19) return 1;
  if (difficulty <= 39) return 2;
  if (difficulty <= 64) return 3;
  return 4;
}

function parseAdvancedFilters(fields: SearchValue, ops: SearchValue, values: SearchValue): ProblemFilterRow[] {
  const fieldValues = valuesOf(fields);
  const opValues = valuesOf(ops);
  const filterValues = valuesOf(values);
  const filters: ProblemFilterRow[] = [];

  for (let index = 0; index < Math.max(fieldValues.length, opValues.length, filterValues.length); index += 1) {
    const field = (fieldValues[index] ?? "").trim();
    const op = (opValues[index] ?? "").trim();
    const value = (filterValues[index] ?? "").trim();

    if (!field || !op || !value) continue;
    filters.push({ field, op, value });
  }

  return filters.slice(0, 8);
}

function textWhere(field: "title" | "bodyMarkdown" | "origin", op: string, value: string): Prisma.ProblemWhereInput {
  return op === "is"
    ? { [field]: { equals: value, mode: "insensitive" } }
    : { [field]: { contains: value, mode: "insensitive" } };
}

function parseDomainFilter(value: string) {
  return parseDomainCode(value);
}

function domainWhere(domainCode: string, includeSpoilerDomains = false): Prisma.ProblemWhereInput {
  const aliases = domainCodeAliases(domainCode);
  const enumAliases = aliases.filter((value): value is MathDomain => Object.values(MathDomain).includes(value as MathDomain));

  if (Object.values(MathDomain).includes(domainCode as MathDomain)) {
    const domain = domainCode as MathDomain;
    if (includeSpoilerDomains) return { OR: [{ domain }, { domains: { some: { domain } } }] };

    return {
      OR: [
        { domains: { some: { domain, spoiler: false } } },
        { AND: [{ domains: { none: {} } }, { domain }] }
      ]
    };
  }

  return {
    OR: [
      {
        domains: {
          some: {
            mscCode: { in: aliases },
            ...(includeSpoilerDomains ? {} : { spoiler: false })
          }
        }
      },
      ...(enumAliases.length
        ? [
            {
              AND: [{ domains: { none: {} } }, { domain: { in: enumAliases } }]
            } satisfies Prisma.ProblemWhereInput
          ]
        : [])
    ]
  };
}

function parseQualityFilter(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_") as QualityStatus;
  if (Object.values(QualityStatus).includes(normalized)) return normalized;
  return undefined;
}

function tagWhere(value: string, includeSpoilerTags: boolean): Prisma.ProblemWhereInput | null {
  const slug = ensureSlug(value, "");
  const tagMatch = {
    tag: {
      OR: [
        ...(slug ? [{ slug }] : []),
        { name: { contains: value, mode: "insensitive" } }
      ]
    }
  } satisfies Prisma.ProblemTagWhereInput;
  const publicWhere = { tags: { some: tagMatch } };
  const spoilerWhere = { spoilerTags: { some: tagMatch } };

  return includeSpoilerTags ? { OR: [publicWhere, spoilerWhere] } : publicWhere;
}

function advancedFilterWhere(filter: ProblemFilterRow, includeSpoilerTags: boolean): Prisma.ProblemWhereInput | null {
  const value = filter.value.trim();
  if (!value) return null;

  if (filter.field === "text") {
    const title = textWhere("title", filter.op, value);
    const body = textWhere("bodyMarkdown", filter.op, value);
    const origin = textWhere("origin", filter.op, value);
    return { OR: [title, body, origin] };
  }

  if (filter.field === "title") return textWhere("title", filter.op, value);
  if (filter.field === "body") return textWhere("bodyMarkdown", filter.op, value);
  if (filter.field === "origin") return textWhere("origin", filter.op, value);

  if (filter.field === "tag") {
    return tagWhere(value, includeSpoilerTags);
  }

  if (filter.field === "domain") {
    const domainFilter = parseDomainFilter(value);
    return domainFilter ? domainWhere(domainFilter, includeSpoilerTags) : null;
  }

  if (filter.field === "status") {
    const statusFilter = parseQualityFilter(value);
    return statusFilter ? { qualityStatus: statusFilter } : null;
  }

  if (filter.field === "difficulty") {
    const difficulty = Number(value);
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 100) return null;
    if (filter.op === "atLeast") return { difficulty: { gte: difficulty } };
    if (filter.op === "atMost") return { difficulty: { lte: difficulty } };
    return { difficulty };
  }

  return null;
}

export default async function ProblemsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    tag?: string;
    difficulty?: string;
    difficultyRange?: string;
    difficultyMin?: string;
    difficultyMax?: string;
    domain?: string;
    quality?: string;
    progress?: string;
    sort?: string;
    page?: string;
    filterLogic?: string;
    filterField?: SearchValue;
    filterOp?: SearchValue;
    filterValue?: SearchValue;
    includeSpoilerTags?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const {
    q = "",
    tag = "",
    difficulty = "",
    difficultyRange = "",
    difficultyMin = "",
    difficultyMax = "",
    domain = "",
    quality = "",
    progress = "",
    sort = "newest",
    page = "1",
    filterLogic = "AND",
    filterField,
    filterOp,
    filterValue,
    includeSpoilerTags = ""
  } = await searchParams;
  const preferredLanguage = await getPreferredContentLanguage();
  const showSpoilerTags = includeSpoilerTags === "1" || includeSpoilerTags === "on";
  const query = q.trim();
  const queryTagSlug = ensureSlug(query, "");
  const tagSlug = ensureSlug(tag, "");
  const legacyDifficultyValue = parseDifficultyBound(difficulty);
  const difficultyRangeOption = parseDifficultyRange(difficultyRange);
  const manualDifficultyMin = parseDifficultyBound(difficultyMin);
  const manualDifficultyMax = parseDifficultyBound(difficultyMax);
  const hasCustomDifficultyBounds =
    manualDifficultyMin !== undefined ||
    manualDifficultyMax !== undefined ||
    (legacyDifficultyValue !== undefined && !difficultyRangeOption.value);
  const difficultyRangeSelectValue = hasCustomDifficultyBounds ? "custom" : difficultyRangeOption.value;
  const rawDifficultyMin = manualDifficultyMin ?? difficultyRangeOption.min ?? legacyDifficultyValue;
  const rawDifficultyMax = manualDifficultyMax ?? difficultyRangeOption.max ?? legacyDifficultyValue;
  const difficultyMinValue =
    rawDifficultyMin !== undefined && rawDifficultyMax !== undefined ? Math.min(rawDifficultyMin, rawDifficultyMax) : rawDifficultyMin;
  const difficultyMaxValue =
    rawDifficultyMin !== undefined && rawDifficultyMax !== undefined ? Math.max(rawDifficultyMin, rawDifficultyMax) : rawDifficultyMax;
  const difficultyWhere =
    difficultyMinValue !== undefined || difficultyMaxValue !== undefined
      ? {
          difficulty: {
            ...(difficultyMinValue !== undefined ? { gte: difficultyMinValue } : {}),
            ...(difficultyMaxValue !== undefined ? { lte: difficultyMaxValue } : {})
          }
        }
      : null;
  const domainValue = domain ? parseDomainCode(domain) : undefined;
  const qualityValue = Object.values(QualityStatus).includes(quality as QualityStatus)
    ? (quality as QualityStatus)
    : undefined;
  const progressValue = parseProgressFilter(progress);
  const progressFilterWhere: Prisma.ProblemWhereInput | null =
    user && progressValue === "unsolved"
      ? { attempts: { none: { userId: user.id, status: "SOLVED" } } }
      : user && progressValue === "solved"
        ? { attempts: { some: { userId: user.id, status: "SOLVED" } } }
        : null;
  const normalizedSort = sort === "attempted" ? "solved" : sort;
  const sortValue = ["newest", "solved", "favorited", "difficulty", "easiest"].includes(normalizedSort)
    ? normalizedSort
    : "newest";
  const advancedLogic = filterLogic === "OR" ? "OR" : "AND";
  const advancedFilters = parseAdvancedFilters(filterField, filterOp, filterValue);
  const advancedClauses = advancedFilters
    .map((filter) => advancedFilterWhere(filter, showSpoilerTags))
    .filter((filter): filter is Prisma.ProblemWhereInput => Boolean(filter));
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const orderBy: Prisma.ProblemOrderByWithRelationInput =
    sortValue === "solved"
      ? { attempts: { _count: "desc" } }
      : sortValue === "favorited"
        ? { favorites: { _count: "desc" } }
        : sortValue === "difficulty"
          ? { difficulty: "desc" }
          : sortValue === "easiest"
            ? { difficulty: "asc" }
            : { createdAt: "desc" };
  const queryClauses: Prisma.ProblemWhereInput[] = [];
  if (query) {
    queryClauses.push(
      { title: { contains: query, mode: "insensitive" } },
      { bodyMarkdown: { contains: query, mode: "insensitive" } },
      { origin: { contains: query, mode: "insensitive" } },
      { tags: { some: { tag: { name: { contains: query, mode: "insensitive" } } } } }
    );
    if (queryTagSlug) {
      queryClauses.push({ tags: { some: { tag: { slug: { contains: queryTagSlug } } } } });
    }
    if (showSpoilerTags) {
      queryClauses.push({ spoilerTags: { some: { tag: { name: { contains: query, mode: "insensitive" } } } } });
      if (queryTagSlug) {
        queryClauses.push({ spoilerTags: { some: { tag: { slug: { contains: queryTagSlug } } } } });
      }
    }
  }
  const baseWhereClauses: Prisma.ProblemWhereInput[] = [
    { status: "PUBLISHED" },
    { listed: true },
    ...(queryClauses.length ? [{ OR: queryClauses } satisfies Prisma.ProblemWhereInput] : []),
    ...(tagSlug ? [tagWhere(tagSlug, showSpoilerTags)].filter((item): item is Prisma.ProblemWhereInput => Boolean(item)) : []),
    ...(difficultyWhere ? [difficultyWhere] : []),
    ...(domainValue ? [domainWhere(domainValue, showSpoilerTags)] : []),
    ...(qualityValue ? [{ qualityStatus: qualityValue }] : []),
    ...(progressFilterWhere ? [progressFilterWhere] : []),
    ...(advancedClauses.length
      ? [{ [advancedLogic]: advancedClauses } satisfies Prisma.ProblemWhereInput]
      : [])
  ];
  const whereClauses: Prisma.ProblemWhereInput[] = [
    ...baseWhereClauses,
    { language: preferredLanguage }
  ];
  const where: Prisma.ProblemWhereInput = { AND: whereClauses };
  const progressWhere: Prisma.ProblemWhereInput = {
    status: "PUBLISHED",
    listed: true,
    language: preferredLanguage,
    ...(domainValue ? domainWhere(domainValue, showSpoilerTags) : {})
  };

  const [totalProblems, tags, progressTotal, progressSolved] = await Promise.all([
    prisma.problem.count({ where }),
    prisma.tag.findMany({
      where: showSpoilerTags
        ? { OR: [{ problems: { some: {} } }, { spoilerProblems: { some: {} } }] }
        : { problems: { some: {} } },
      orderBy: { name: "asc" },
      take: 80
    }),
    prisma.problem.count({ where: progressWhere }),
    user
      ? prisma.problemAttempt.count({
          where: {
            userId: user.id,
            status: "SOLVED",
            problem: progressWhere
          }
        })
      : Promise.resolve(0)
  ]);
  const otherLanguageProblems =
    totalProblems === 0
      ? await prisma.problem.count({
          where: {
            AND: [
              ...baseWhereClauses,
              { language: { not: preferredLanguage } }
            ]
          }
        })
      : 0;
  const totalPages = Math.max(1, Math.ceil(totalProblems / PROBLEMS_PER_PAGE));
  const currentPage = Math.min(requestedPage, totalPages);
  const problems = await prisma.problem.findMany({
    where,
    orderBy,
    skip: (currentPage - 1) * PROBLEMS_PER_PAGE,
    take: PROBLEMS_PER_PAGE,
    include: {
      author: true,
      domains: { orderBy: { position: "asc" } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      spoilerTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      attempts: { where: { status: "SOLVED" }, select: { userId: true } },
      favorites: { select: { userId: true } },
      _count: { select: { favorites: true } }
    }
  });
  const displayedProblemIds = problems.map((problem) => problem.id);
  const [problemAttempts, problemFavorites] =
    user && displayedProblemIds.length
      ? await Promise.all([
          prisma.problemAttempt.findMany({
            where: { userId: user.id, problemId: { in: displayedProblemIds } },
            select: { problemId: true, status: true }
          }),
          prisma.problemFavorite.findMany({
            where: { userId: user.id, problemId: { in: displayedProblemIds } },
            select: { problemId: true }
          })
        ])
      : [[], []];
  const solvedIds = new Set(
    problemAttempts.filter((attempt) => attempt.status === "SOLVED").map((attempt) => attempt.problemId)
  );
  const openedIds = new Set(
    problemAttempts.filter((attempt) => attempt.status !== "SOLVED").map((attempt) => attempt.problemId)
  );
  const favoriteIds = new Set(problemFavorites.map((favorite) => favorite.problemId));
  const paginationParams = {
    q: query,
    tag: tagSlug,
    difficultyRange: difficultyRangeOption.value || undefined,
    difficultyMin: manualDifficultyMin ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : undefined),
    difficultyMax: manualDifficultyMax ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : undefined),
    domain: domainValue,
    quality: qualityValue,
    progress: user && progressValue !== "unsolved" ? progressValue : undefined,
    sort: sortValue === "newest" ? undefined : sortValue,
    filterLogic: advancedFilters.length ? advancedLogic : undefined,
    filterField: advancedFilters.map((filter) => filter.field),
    filterOp: advancedFilters.map((filter) => filter.op),
    filterValue: advancedFilters.map((filter) => filter.value),
    includeSpoilerTags: showSpoilerTags ? "1" : undefined
  };
  const resultStart = totalProblems ? (currentPage - 1) * PROBLEMS_PER_PAGE + 1 : 0;
  const resultEnd = Math.min(currentPage * PROBLEMS_PER_PAGE, totalProblems);
  const progressPercent = progressTotal ? Math.round((progressSolved / progressTotal) * 100) : 0;
  const progressScope = domainValue ? domainLabel(domainValue) : "all domains";

  return (
    <div className="problems-page-shell">
      <section className="problems-hero">
        <img src="/art/hero-rye.jpg" alt="Ivan Shishkin, Rye (1878)" />
        <div className="problems-hero-overlay" />
        <div className="problems-hero-content">
          <div>
            <h1>Problems</h1>
          </div>
          <div className="problems-hero-meta">
            <p>
              {progressTotal} {progressTotal === 1 ? "problem" : "problems"} · 21 domains
            </p>
            {user ? (
              <p>
                You solved {progressSolved} in {progressScope} ({progressPercent}%).
              </p>
            ) : (
              <p>Sign in to track solved problems across {progressScope}.</p>
            )}
            <Link href="/problems/new" className="button">
              Add a problem
            </Link>
          </div>
        </div>
      </section>

      <ProblemDomainStrip domains={PROBLEM_DOMAINS} families={PROBLEM_DOMAIN_FAMILIES} selectedDomain={domainValue} />

      <div className="problems-workspace">
        <aside className="problems-filter-panel">
          <LiveSearchForm className="problem-filter-form">
            <label className="problem-filter-search">
              <span>Search problems</span>
              <input name="q" defaultValue={query} />
            </label>
            {domainValue && <input type="hidden" name="domain" value={domainValue} />}

            <div className="problem-filter-section">
              <p>Difficulty</p>
              <ProblemDifficultyFilter
                customBounds={hasCustomDifficultyBounds}
                initialMax={difficultyMaxValue}
                initialMin={difficultyMinValue}
                ranges={DIFFICULTY_RANGES}
                selectedRange={difficultyRangeSelectValue}
              />
            </div>

            <div className="problem-filter-section">
              <p>Status</p>
              {user && (
                <select name="progress" defaultValue={progressValue} aria-label="Solved status">
                  <option value="unsolved">Unsolved</option>
                  <option value="solved">Solved</option>
                  <option value="all">All problems</option>
                </select>
              )}
              <select name="quality" defaultValue={qualityValue ?? ""}>
                <option value="">Any quality</option>
                <option value="NEEDS_WORK">Needs work</option>
                <option value="UNREVIEWED">Unreviewed</option>
                <option value="GOOD">Good</option>
                <option value="EXCELLENT">Excellent</option>
              </select>
              {sortValue !== "newest" && <input type="hidden" name="sort" value={sortValue} />}
              <label className="checkbox-inline">
                <input name="includeSpoilerTags" type="checkbox" value="1" defaultChecked={showSpoilerTags} />
                <span>Include spoilers</span>
              </label>
            </div>

            <ProblemFilterBuilder
              domains={FLAT_PROBLEM_DOMAIN_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
              initialFilters={advancedFilters}
              initialLogic={advancedLogic}
              statuses={Object.values(QualityStatus).map((status) => ({ value: status, label: qualityLabel(status) }))}
              tags={tags.map((item) => ({ value: item.slug, label: item.name }))}
            />
          </LiveSearchForm>
        </aside>

        <section className="problems-ledger" aria-label="Problems">
          <div className="problems-ledger-header">
            <div>
              {totalProblems > 0 && (
                <p className="result-summary" role="status" aria-live="polite">
                  Showing {resultStart}-{resultEnd} of {totalProblems} problems
                </p>
              )}
            </div>
            <ProblemSortControl options={SORT_OPTIONS} value={sortValue} />
          </div>

          <div className="problem-ledger-list">
            {problems.map((problem) => {
              const isOwnProblem = user?.id === problem.authorId;
              const isUserFavorite = !isOwnProblem && favoriteIds.has(problem.id);
              const externalSolveCount = problem.attempts.filter((attempt) => attempt.userId !== problem.authorId).length;
              const externalFavoriteCount = problem.favorites.filter((favorite) => favorite.userId !== problem.authorId).length;
              const revealSpoilerDomains = showSpoilerTags || solvedIds.has(problem.id);
              const visibleDomainCodes = problem.domains.length
                ? problem.domains
                    .filter((item) => revealSpoilerDomains || !item.spoiler)
                    .map((item) => item.mscCode)
                : [problem.domain];
              const hiddenDomainCount = revealSpoilerDomains ? 0 : problem.domains.filter((item) => item.spoiler).length;
              const difficulty = problem.difficulty ?? null;
              const difficultyLevel = difficultyBars(difficulty);
              const tone = difficultyColor(difficulty);

              return (
                <Link
                  key={problem.id}
                  href={`/problems/${problem.slug}`}
                  title={isOwnProblem ? "Your problem" : isUserFavorite ? "Favorite problem" : undefined}
                  className={`${problemLinkClass(
                    "problem-ledger-row",
                    solvedIds.has(problem.id) ? "solved" : openedIds.has(problem.id) ? "opened" : null
                  )}${isOwnProblem ? " problem-own" : isUserFavorite ? " problem-favorite" : ""}`}
                >
                  <div className="problem-ledger-difficulty" style={{ color: tone }}>
                    <span>{difficulty ? String(difficulty).padStart(2, "0") : "--"}</span>
                    <span className="problem-ledger-bars" aria-hidden="true">
                      {[1, 2, 3, 4].map((level) => (
                        <i key={level} style={{ background: level <= difficultyLevel ? tone : undefined }} />
                      ))}
                    </span>
                  </div>
                  <div className="problem-ledger-main">
                    <h3>
                      <AsyncMarkdownInline markdown={problem.title} />
                    </h3>
                    <p>
                      {visibleDomainCodes.length ? visibleDomainCodes.map(domainLabel).join(" · ") : "Domain hidden"}
                      {hiddenDomainCount > 0 && visibleDomainCodes.length > 0 ? " · spoiler domain hidden" : ""} ·{" "}
                      {externalSolveCount} solved · {qualityLabel(problem.qualityStatus)}
                    </p>
                    {problem.tags.length > 0 && (
                      <div className="problem-ledger-tags">
                        {problem.tags.map(({ tag }) => (
                          <span key={tag.id} className="tag">
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {showSpoilerTags && problem.spoilerTags.length > 0 && (
                      <div className="problem-ledger-tags">
                        <span className="meta">Spoiler:</span>
                        {problem.spoilerTags.map(({ tag }) => (
                          <span key={tag.id} className="tag spoiler-tag">
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="problem-ledger-side">
                    <span>by {displayNameForUser(problem.author)}</span>
                    <span
                      className={isUserFavorite ? "problem-favorite-count problem-favorite-count-own" : "problem-favorite-count"}
                      title={isUserFavorite ? "You favorited this problem" : "Favorites"}
                    >
                      <Heart size={15} fill={isUserFavorite ? "currentColor" : "none"} />
                      {externalFavoriteCount}
                    </span>
                  </div>
                </Link>
              );
            })}
            {problems.length === 0 && (
              <p className="empty-state">
                No problems match these filters.
                {otherLanguageProblems > 0 && (
                  <>
                    <br />
                    {pluralize(otherLanguageProblems, "problem")} found in other languages.
                  </>
                )}
              </p>
            )}
          </div>

          {totalPages > 1 && (
            <nav className="pagination" aria-label="Problem pages">
              {currentPage > 1 ? (
                <Link href={problemsHref({ ...paginationParams, page: currentPage - 1 }) as never}>Previous</Link>
              ) : (
                <span aria-disabled="true">Previous</span>
              )}
              <span className="pagination-status">
                Page {currentPage} of {totalPages}
              </span>
              {currentPage < totalPages ? (
                <Link href={problemsHref({ ...paginationParams, page: currentPage + 1 }) as never}>Next</Link>
              ) : (
                <span aria-disabled="true">Next</span>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
