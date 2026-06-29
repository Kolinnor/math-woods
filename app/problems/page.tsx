import { MathDomain, Prisma, QualityStatus } from "@prisma/client";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { Heart } from "lucide-react";
import { DomainBrowserNav } from "@/components/DomainBrowserNav";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { ProblemFilterBuilder, type ProblemFilterRow } from "@/components/ProblemFilterBuilder";
import { ProblemStatusLegend } from "@/components/ProblemStatusLegend";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  domainCodeAliases,
  domainDescription,
  domainLabel,
  FLAT_DOMAIN_OPTIONS,
  MATH_DOMAINS,
  parseDomainCode
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
    domains: {
      some: {
        mscCode: { in: domainCodeAliases(domainCode) },
        ...(includeSpoilerDomains ? {} : { spoiler: false })
      }
    }
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
  const selectedDomainDescription = domainValue ? domainDescription(domainValue) : null;

  return (
    <div className="directory-page">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold">Problems</h1>
          {selectedDomainDescription && <p className="muted mt-1">{selectedDomainDescription}</p>}
          {user ? (
            <p className="progress-summary">
              You solved {progressSolved} of {progressTotal} problems in {progressScope} ({progressPercent}%).
            </p>
          ) : (
            <p className="progress-summary">
              Sign in to track solved problems across {progressScope}.
            </p>
          )}
        </div>
        <Link href="/problems/new" className="button">
          Add a problem
        </Link>
      </div>

      <div className="filter-tabs">
        <DomainBrowserNav domains={MATH_DOMAINS} selectedDomain={domainValue} />
      </div>

      <LiveSearchForm className="problem-search-shell mb-6">
        <div className="problem-search-main">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Search problems</span>
            <input name="q" defaultValue={query} placeholder='Try "polynomial", "invariant", "origin: IMO"...' />
          </label>
          <button type="submit">Search</button>
        </div>
        <div className="problem-search-filters">
          {domainValue && <input type="hidden" name="domain" value={domainValue} />}
          <div className="difficulty-filter">
            <select name="difficultyRange" defaultValue={difficultyRangeSelectValue}>
              {hasCustomDifficultyBounds && <option value="custom">Custom difficulty</option>}
              {DIFFICULTY_RANGES.map((range) => (
                <option key={range.value || "any"} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
            <div className="difficulty-filter-bounds">
              <input
                name="difficultyMin"
                type="number"
                min="1"
                max="100"
                defaultValue={manualDifficultyMin ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : "")}
                placeholder="Min"
                aria-label="Minimum difficulty"
              />
              <input
                name="difficultyMax"
                type="number"
                min="1"
                max="100"
                defaultValue={manualDifficultyMax ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : "")}
                placeholder="Max"
                aria-label="Maximum difficulty"
              />
            </div>
          </div>
          <select name="quality" defaultValue={qualityValue ?? ""}>
            <option value="">Any status</option>
            <option value="NEEDS_WORK">Needs work</option>
            <option value="UNREVIEWED">Unreviewed</option>
            <option value="GOOD">Good</option>
            <option value="EXCELLENT">Excellent</option>
          </select>
          {user && (
            <select name="progress" defaultValue={progressValue} aria-label="Solved status">
              <option value="unsolved">Unsolved</option>
              <option value="solved">Solved</option>
              <option value="all">All problems</option>
            </select>
          )}
          <select name="sort" defaultValue={sortValue}>
            <option value="newest">Newest</option>
            <option value="solved">Most solved</option>
            <option value="favorited">Most loved</option>
            <option value="difficulty">Hardest first</option>
            <option value="easiest">Easiest first</option>
          </select>
          <label className="checkbox-inline">
            <input name="includeSpoilerTags" type="checkbox" value="1" defaultChecked={showSpoilerTags} />
            <span>Include spoilers</span>
          </label>
        </div>
        <ProblemFilterBuilder
          domains={FLAT_DOMAIN_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          initialFilters={advancedFilters}
          initialLogic={advancedLogic}
          statuses={Object.values(QualityStatus).map((status) => ({ value: status, label: qualityLabel(status) }))}
          tags={tags.map((item) => ({ value: item.slug, label: item.name }))}
        />
      </LiveSearchForm>

      <ProblemStatusLegend />

      <p className="result-summary" role="status" aria-live="polite">
        {totalProblems
          ? `Showing ${resultStart}-${resultEnd} of ${totalProblems} problems`
          : `No ${contentLanguageLabel(preferredLanguage).toLowerCase()} problems match these filters.`}
      </p>

      <div className="list-surface">
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

          return (
            <Link
              key={problem.id}
              href={`/problems/${problem.slug}`}
              title={isOwnProblem ? "Your problem" : isUserFavorite ? "Favorite problem" : undefined}
              className={`${problemLinkClass(
                "list-row block",
                solvedIds.has(problem.id) ? "solved" : openedIds.has(problem.id) ? "opened" : null
              )}${isOwnProblem ? " problem-own" : isUserFavorite ? " problem-favorite" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    <AsyncMarkdownInline markdown={problem.title} />
                  </h2>
                  <p className="meta">
                    by {displayNameForUser(problem.author)} / {externalSolveCount} solved
                  </p>
                  <p className="meta">
                    {visibleDomainCodes.length ? visibleDomainCodes.map(domainLabel).join(" / ") : "Domain hidden"}
                    {hiddenDomainCount > 0 && visibleDomainCodes.length > 0 ? " / spoiler domain hidden" : ""} /{" "}
                    {qualityLabel(problem.qualityStatus)}
                  </p>
                  {problem.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {problem.tags.map(({ tag }) => (
                        <span key={tag.id} className="tag">
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {showSpoilerTags && problem.spoilerTags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="meta">Spoiler:</span>
                      {problem.spoilerTags.map(({ tag }) => (
                        <span key={tag.id} className="tag spoiler-tag">
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="problem-card-stats">
                  <span
                    className={isUserFavorite ? "problem-favorite-count problem-favorite-count-own" : "problem-favorite-count"}
                    title={isUserFavorite ? "You favorited this problem" : "Favorites"}
                  >
                    <Heart size={15} fill={isUserFavorite ? "currentColor" : "none"} />
                    {externalFavoriteCount}
                  </span>
                  <span className="meta">
                    {problem.difficulty ? `difficulty ${problem.difficulty}/100` : "difficulty not set"}
                  </span>
                </div>
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
    </div>
  );
}
