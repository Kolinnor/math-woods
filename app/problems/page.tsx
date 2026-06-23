import { MathDomain, Prisma, QualityStatus } from "@prisma/client";
import Link from "next/link";
import { Heart } from "lucide-react";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { ProblemFilterBuilder, type ProblemFilterRow } from "@/components/ProblemFilterBuilder";
import { ProblemStatusLegend } from "@/components/ProblemStatusLegend";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { domainLabel, MATH_DOMAINS } from "@/lib/domains";
import { pluralize } from "@/lib/pluralize";
import { problemLinkClass } from "@/lib/problem-link";
import { qualityLabel } from "@/lib/quality";
import { ensureSlug } from "@/lib/slug";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

const PROBLEMS_PER_PAGE = 40;
type SearchValue = string | string[] | undefined;

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
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_") as MathDomain;
  if (Object.values(MathDomain).includes(normalized)) return normalized;
  return MATH_DOMAINS.find((item) => item.label.toLowerCase() === value.trim().toLowerCase())?.value;
}

function domainWhere(domain: MathDomain): Prisma.ProblemWhereInput {
  return { OR: [{ domain }, { domains: { some: { domain } } }] };
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
    return domainFilter ? domainWhere(domainFilter) : null;
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
    domain?: string;
    quality?: string;
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
    domain = "",
    quality = "",
    sort = "newest",
    page = "1",
    filterLogic = "AND",
    filterField,
    filterOp,
    filterValue,
    includeSpoilerTags = ""
  } = await searchParams;
  const showSpoilerTags = includeSpoilerTags === "1" || includeSpoilerTags === "on";
  const query = q.trim();
  const tagSlug = ensureSlug(tag, "");
  const parsedDifficulty = Number(difficulty);
  const difficultyValue =
    Number.isInteger(parsedDifficulty) && parsedDifficulty >= 1 && parsedDifficulty <= 100
      ? parsedDifficulty
      : undefined;
  const domainValue = Object.values(MathDomain).includes(domain as MathDomain) ? (domain as MathDomain) : undefined;
  const qualityValue = Object.values(QualityStatus).includes(quality as QualityStatus)
    ? (quality as QualityStatus)
    : undefined;
  const sortValue = ["newest", "attempted", "favorited", "difficulty"].includes(sort) ? sort : "newest";
  const advancedLogic = filterLogic === "OR" ? "OR" : "AND";
  const advancedFilters = parseAdvancedFilters(filterField, filterOp, filterValue);
  const advancedClauses = advancedFilters
    .map((filter) => advancedFilterWhere(filter, showSpoilerTags))
    .filter((filter): filter is Prisma.ProblemWhereInput => Boolean(filter));
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const orderBy: Prisma.ProblemOrderByWithRelationInput =
    sortValue === "attempted"
      ? { attempts: { _count: "desc" } }
      : sortValue === "favorited"
        ? { favorites: { _count: "desc" } }
        : sortValue === "difficulty"
          ? { difficulty: "desc" }
          : { createdAt: "desc" };
  const whereClauses: Prisma.ProblemWhereInput[] = [
    { status: "PUBLISHED" },
    { listed: true },
    ...(query
      ? [
          {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { bodyMarkdown: { contains: query, mode: "insensitive" } },
              { origin: { contains: query, mode: "insensitive" } }
            ]
          } satisfies Prisma.ProblemWhereInput
        ]
      : []),
    ...(tagSlug ? [tagWhere(tagSlug, showSpoilerTags)].filter((item): item is Prisma.ProblemWhereInput => Boolean(item)) : []),
    ...(difficultyValue ? [{ difficulty: difficultyValue }] : []),
    ...(domainValue ? [domainWhere(domainValue)] : []),
    ...(qualityValue ? [{ qualityStatus: qualityValue }] : []),
    ...(advancedClauses.length
      ? [{ [advancedLogic]: advancedClauses } satisfies Prisma.ProblemWhereInput]
      : [])
  ];
  const where: Prisma.ProblemWhereInput = { AND: whereClauses };
  const progressWhere: Prisma.ProblemWhereInput = {
    status: "PUBLISHED",
    listed: true,
    ...(domainValue ? domainWhere(domainValue) : {})
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
      _count: { select: { attempts: true, favorites: true } }
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
    difficulty: difficultyValue,
    domain: domainValue,
    quality: qualityValue,
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
    <div className="directory-page">
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-bold">Problems</h1>
          <p className="muted mt-1">Browse, attempt, annotate, then reveal the discussion when you are ready.</p>
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
        <Link href="/problems" className={!domainValue ? "active" : ""}>
          All domains
        </Link>
        {MATH_DOMAINS.map((item) => (
          <Link
            key={item.value}
            href={`/problems?domain=${item.value}`}
            className={domainValue === item.value ? "active" : ""}
          >
            {item.label}
          </Link>
        ))}
        <Link href="/problems?tag=conjecture" className={tagSlug === "conjecture" ? "active" : ""}>
          Conjectures
        </Link>
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
          <select name="domain" defaultValue={domainValue ?? ""}>
            <option value="">Any domain</option>
            {MATH_DOMAINS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select name="tag" defaultValue={tagSlug}>
            <option value="">Any tag</option>
            {tags.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            name="difficulty"
            type="number"
            min="1"
            max="100"
            defaultValue={difficultyValue ?? ""}
            placeholder="Difficulty"
          />
          <select name="quality" defaultValue={qualityValue ?? ""}>
            <option value="">Any status</option>
            <option value="NEEDS_WORK">Needs work</option>
            <option value="UNREVIEWED">Unreviewed</option>
            <option value="GOOD">Good</option>
            <option value="EXCELLENT">Excellent</option>
          </select>
          <select name="sort" defaultValue={sortValue}>
            <option value="newest">Newest</option>
            <option value="attempted">Most attempted</option>
            <option value="favorited">Most loved</option>
            <option value="difficulty">Hardest first</option>
          </select>
          <label className="checkbox-inline">
            <input name="includeSpoilerTags" type="checkbox" value="1" defaultChecked={showSpoilerTags} />
            <span>Include spoiler tags</span>
          </label>
        </div>
        <ProblemFilterBuilder
          domains={MATH_DOMAINS.map((item) => ({ value: item.value, label: item.label }))}
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
          : "No problems match these filters."}
      </p>

      <div className="list-surface">
        {problems.map((problem) => (
          <Link
            key={problem.id}
            href={`/problems/${problem.slug}`}
            title={user?.id === problem.authorId ? "Your problem" : favoriteIds.has(problem.id) ? "Favorite problem" : undefined}
            className={`${problemLinkClass(
              "list-row block",
              solvedIds.has(problem.id) ? "solved" : openedIds.has(problem.id) ? "opened" : null
            )}${user?.id === problem.authorId ? " problem-own" : favoriteIds.has(problem.id) ? " problem-favorite" : ""}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{problem.title}</h2>
                <p className="meta">
                  by {displayNameForUser(problem.author)} / {pluralize(problem._count.attempts, "attempt")}
                </p>
                <p className="meta">
                  {(problem.domains.length ? problem.domains.map((item) => item.domain) : [problem.domain])
                    .map(domainLabel)
                    .join(" / ")} / {qualityLabel(problem.qualityStatus)}
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
                  className={
                    favoriteIds.has(problem.id)
                      ? "problem-favorite-count problem-favorite-count-own"
                      : "problem-favorite-count"
                  }
                  title={favoriteIds.has(problem.id) ? "You favorited this problem" : "Favorites"}
                >
                  <Heart size={15} fill={favoriteIds.has(problem.id) ? "currentColor" : "none"} />
                  {problem._count.favorites}
                </span>
                <span className="meta">
                  {problem.difficulty ? `difficulty ${problem.difficulty}/100` : "difficulty not set"}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {problems.length === 0 && <p className="empty-state">No problems match these filters.</p>}
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
