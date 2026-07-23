import { MathDomain, Prisma, QualityStatus, UserMathLevel } from "@prisma/client";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContributionRequestDialog } from "@/components/ContributionRequestDialog";
import { Heart, House } from "lucide-react";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { ProblemFilterBuilder, type ProblemFilterRow } from "@/components/ProblemFilterBuilder";
import { ProblemDifficultyFilter } from "@/components/ProblemDifficultyFilter";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { getCurrentUser } from "@/lib/auth";
import { createContributionRequestAction } from "@/lib/actions/contribution-request-actions";
import { prisma } from "@/lib/db";
import {
  domainCodeAliases,
  domainDescription,
  domainLabel,
  FLAT_PROBLEM_DOMAIN_OPTIONS,
  parseDomainCode,
  translatedDomainLabel as translatedDomainOptionLabel
} from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { contentLanguageLabel, SUPPORTED_CONTENT_LANGUAGES } from "@/lib/languages";
import { problemLinkClass } from "@/lib/problem-link";
import { problemDifficultyBars, problemDifficultyTone } from "@/lib/problem-difficulty";
import { canViewUnreviewedProblems, visibleProblemWhere } from "@/lib/problem-visibility";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { ensureSlug } from "@/lib/slug";
import { displayNameForUser } from "@/lib/user-display";
import { hasAdminPrivileges } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const PROBLEMS_PER_PAGE = 7;
type SearchValue = string | string[] | undefined;
type DifficultyRange = {
  value: string;
  label: string;
  min?: number;
  max?: number;
};
type ProgressFilter = "unsolved" | "solved" | "all";
type OwnershipFilter = "all" | "mine" | "others";
type SolutionFilter = "with" | "without" | "all";

const SUPPORTED_LANGUAGE_CODES = SUPPORTED_CONTENT_LANGUAGES.map((language) => language.code);
const SUPPORTED_LANGUAGE_CODE_SET = new Set(SUPPORTED_LANGUAGE_CODES);

const DIFFICULTY_RANGES: DifficultyRange[] = [
  { value: "", label: "Any difficulty" },
  { value: "1-5", label: "Just started (1-5)", min: 1, max: 5 },
  { value: "6-19", label: "Beginner / High school (6-19)", min: 6, max: 19 },
  { value: "20-39", label: "Intermediate / Undergraduate (20-39)", min: 20, max: 39 },
  { value: "40-64", label: "Advanced / Graduate (40-64)", min: 40, max: 64 },
  { value: "65-84", label: "Expert / Specialized (65-84)", min: 65, max: 84 },
  { value: "85-100", label: "Research-level (85-100)", min: 85, max: 100 }
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "solved", label: "Most solved" },
  { value: "favorited", label: "Most favorited" },
  { value: "difficulty", label: "Hardest first" },
  { value: "easiest", label: "Easiest first" }
];

function translatedDomainLabel(domain: MathDomain | string, t: Dictionary) {
  return translatedDomainOptionLabel(domain, t.home.domainLabels);
}

function parseProgressFilter(value: string | undefined): ProgressFilter {
  return value === "solved" || value === "all" ? value : "unsolved";
}

function parseOwnershipFilter(value: string | undefined): OwnershipFilter {
  return value === "mine" || value === "others" ? value : "all";
}

function canDefaultToAllSolutions(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user) return false;
  if (hasAdminPrivileges(user.role)) return true;
  return (
    user.mathLevel === UserMathLevel.ADVANCED_UNDERGRAD ||
    user.mathLevel === UserMathLevel.GRADUATE_CONTEST ||
    user.mathLevel === UserMathLevel.RESEARCH
  );
}

function parseSolutionFilter(value: string | undefined, defaultValue: SolutionFilter): SolutionFilter {
  if (value === "with" || value === "without" || value === "all") return value;
  return defaultValue;
}

function parseLanguageFilters(value: SearchValue) {
  const values = valuesOf(value)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => SUPPORTED_LANGUAGE_CODE_SET.has(item));
  const uniqueValues = [...new Set(values)];
  return uniqueValues.length ? uniqueValues : SUPPORTED_LANGUAGE_CODES;
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

function languagePreferenceRank(language: string, preferredLanguage: string, selectedLanguages: string[]) {
  if (language === preferredLanguage) return 0;
  const selectedIndex = selectedLanguages.indexOf(language);
  return selectedIndex >= 0 ? selectedIndex + 1 : selectedLanguages.length + 1;
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
    ownership?: string;
    solutions?: string;
    language?: SearchValue;
    author?: string;
    sort?: string;
    page?: string;
    showAll?: string;
    filterLogic?: string;
    filterField?: SearchValue;
    filterOp?: SearchValue;
    filterValue?: SearchValue;
    includeSpoilerTags?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const t = await getTranslations();
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
    ownership = "",
    solutions = "",
    language,
    author = "",
    sort = "newest",
    page = "1",
    showAll = "",
    filterLogic = "AND",
    filterField,
    filterOp,
    filterValue,
    includeSpoilerTags = ""
  } = await searchParams;
  const preferredLanguage = await getPreferredContentLanguage();
  const showSpoilerTags = includeSpoilerTags === "1" || includeSpoilerTags === "on";
  const showAllProblems = showAll === "1" || showAll === "on";
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
  const ownershipValue = user ? parseOwnershipFilter(ownership) : "all";
  const languageValues = parseLanguageFilters(language);
  const includesEveryLanguage = languageValues.length === SUPPORTED_LANGUAGE_CODES.length;
  const languageWhere: Prisma.ProblemWhereInput | null = includesEveryLanguage ? null : { language: { in: languageValues } };
  const defaultSolutionValue: SolutionFilter = canDefaultToAllSolutions(user) ? "all" : "with";
  const solutionValue = parseSolutionFilter(solutions, defaultSolutionValue);
  const problemVisibilityWhere = visibleProblemWhere(user);
  const canSeeUnreviewedProblems = canViewUnreviewedProblems(user);
  const solutionWhere: Prisma.ProblemWhereInput | null =
    solutionValue === "with"
      ? { proofs: { some: {} } }
      : solutionValue === "without"
        ? { proofs: { none: {} } }
        : null;
  const authorQuery = author.trim();
  const authorSlug = ensureSlug(authorQuery, "");
  const authorWhere: Prisma.ProblemWhereInput | null = authorQuery
    ? {
        author: {
          OR: [
            { username: { contains: authorSlug || authorQuery, mode: "insensitive" } },
            { displayName: { contains: authorQuery, mode: "insensitive" } }
          ]
        }
      }
    : null;
  const solvedProblemGroups = user
    ? await prisma.problem.findMany({
        where: { attempts: { some: { userId: user.id, status: "SOLVED" } } },
        distinct: ["translationGroupId"],
        select: { translationGroupId: true }
      })
    : [];
  const solvedTranslationGroupIds = solvedProblemGroups.map((problem) => problem.translationGroupId);
  const solvedTranslationGroupIdSet = new Set(solvedTranslationGroupIds);
  const progressFilterWhere: Prisma.ProblemWhereInput | null =
    user && progressValue === "unsolved"
      ? { translationGroupId: { notIn: solvedTranslationGroupIds } }
      : user && progressValue === "solved"
        ? { translationGroupId: { in: solvedTranslationGroupIds } }
        : null;
  const ownershipWhere: Prisma.ProblemWhereInput | null =
    user && ownershipValue === "mine"
      ? { authorId: user.id }
      : user && ownershipValue === "others"
        ? { authorId: { not: user.id } }
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
    problemVisibilityWhere,
    ...(queryClauses.length ? [{ OR: queryClauses } satisfies Prisma.ProblemWhereInput] : []),
    ...(tagSlug ? [tagWhere(tagSlug, showSpoilerTags)].filter((item): item is Prisma.ProblemWhereInput => Boolean(item)) : []),
    ...(difficultyWhere ? [difficultyWhere] : []),
    ...(domainValue ? [domainWhere(domainValue, showSpoilerTags)] : []),
    ...(qualityValue ? [{ qualityStatus: qualityValue }] : []),
    ...(progressFilterWhere ? [progressFilterWhere] : []),
    ...(ownershipWhere ? [ownershipWhere] : []),
    ...(solutionWhere ? [solutionWhere] : []),
    ...(languageWhere ? [languageWhere] : []),
    ...(authorWhere ? [authorWhere] : []),
    ...(advancedClauses.length
      ? [{ [advancedLogic]: advancedClauses } satisfies Prisma.ProblemWhereInput]
      : [])
  ];
  const whereClauses: Prisma.ProblemWhereInput[] = [...baseWhereClauses];
  const where: Prisma.ProblemWhereInput = { AND: whereClauses };
  const progressWhere: Prisma.ProblemWhereInput = {
    status: "PUBLISHED",
    listed: true,
    ...problemVisibilityWhere,
    ...(languageWhere ?? {}),
    ...(ownershipWhere ?? {}),
    ...(authorWhere ?? {}),
    ...(domainValue ? domainWhere(domainValue, showSpoilerTags) : {})
  };

  const [tags, progressProblemGroups, problemCandidateKeys] = await Promise.all([
    prisma.tag.findMany({
      where: showSpoilerTags
        ? { OR: [{ problems: { some: {} } }, { spoilerProblems: { some: {} } }] }
        : { problems: { some: {} } },
      orderBy: { name: "asc" },
      take: 80
    }),
    prisma.problem.findMany({
      where: progressWhere,
      distinct: ["translationGroupId"],
      select: { translationGroupId: true }
    }),
    prisma.problem.findMany({
      where,
      orderBy,
      select: {
        id: true,
        translationGroupId: true,
        language: true,
        translatedFromProblemId: true
      }
    })
  ]);
  const progressTotal = progressProblemGroups.length;
  const progressSolved = progressProblemGroups.filter((problem) =>
    solvedTranslationGroupIdSet.has(problem.translationGroupId)
  ).length;
  const candidatesByTranslationGroup = new Map<string, typeof problemCandidateKeys>();
  for (const candidate of problemCandidateKeys) {
    candidatesByTranslationGroup.set(candidate.translationGroupId, [
      ...(candidatesByTranslationGroup.get(candidate.translationGroupId) ?? []),
      candidate
    ]);
  }
  const dedupedProblems = [...candidatesByTranslationGroup.values()].map((candidates) => {
    const sortedCandidates = [...candidates].sort((left, right) => {
      const languageRank =
        languagePreferenceRank(left.language, preferredLanguage, languageValues) -
        languagePreferenceRank(right.language, preferredLanguage, languageValues);
      if (languageRank !== 0) return languageRank;
      if (left.translatedFromProblemId === null && right.translatedFromProblemId !== null) return -1;
      if (left.translatedFromProblemId !== null && right.translatedFromProblemId === null) return 1;
      return candidates.indexOf(left) - candidates.indexOf(right);
    });
    return sortedCandidates[0];
  });
  const totalProblems = dedupedProblems.length;
  const totalPages = showAllProblems ? 1 : Math.max(1, Math.ceil(totalProblems / PROBLEMS_PER_PAGE));
  const currentPage = showAllProblems ? 1 : Math.min(requestedPage, totalPages);
  const pageProblemKeys = showAllProblems
    ? dedupedProblems
    : dedupedProblems.slice((currentPage - 1) * PROBLEMS_PER_PAGE, currentPage * PROBLEMS_PER_PAGE);
  const pageProblemIds = pageProblemKeys.map((problem) => problem.id);
  const pageProblems = pageProblemIds.length
    ? await prisma.problem.findMany({
        where: { id: { in: pageProblemIds } },
        include: {
          author: true,
          domains: { orderBy: { position: "asc" } },
          tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
          spoilerTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }
        }
      })
    : [];
  const problemById = new Map(pageProblems.map((problem) => [problem.id, problem]));
  const problems = pageProblemIds.flatMap((problemId) => {
    const problem = problemById.get(problemId);
    return problem ? [problem] : [];
  });
  const displayedTranslationGroupIds = problems.map((problem) => problem.translationGroupId);
  const [groupAttempts, groupFavorites] = displayedTranslationGroupIds.length
    ? await Promise.all([
        prisma.problemAttempt.findMany({
          where: { problem: { translationGroupId: { in: displayedTranslationGroupIds } } },
          select: {
            userId: true,
            status: true,
            problem: { select: { translationGroupId: true } }
          }
        }),
        prisma.problemFavorite.findMany({
          where: { problem: { translationGroupId: { in: displayedTranslationGroupIds } } },
          select: {
            userId: true,
            problem: { select: { translationGroupId: true } }
          }
        })
      ])
    : [[], []];
  const solvedUsersByGroup = new Map<string, Set<number>>();
  const favoriteUsersByGroup = new Map<string, Set<number>>();
  const openedTranslationGroupIds = new Set<string>();
  for (const attempt of groupAttempts) {
    const groupId = attempt.problem.translationGroupId;
    if (attempt.status === "SOLVED") {
      const solvedUsers = solvedUsersByGroup.get(groupId) ?? new Set<number>();
      solvedUsers.add(attempt.userId);
      solvedUsersByGroup.set(groupId, solvedUsers);
    } else if (attempt.userId === user?.id) {
      openedTranslationGroupIds.add(groupId);
    }
  }
  for (const favorite of groupFavorites) {
    const groupId = favorite.problem.translationGroupId;
    const favoriteUsers = favoriteUsersByGroup.get(groupId) ?? new Set<number>();
    favoriteUsers.add(favorite.userId);
    favoriteUsersByGroup.set(groupId, favoriteUsers);
  }
  const paginationParams = {
    q: query,
    tag: tagSlug,
    difficultyRange: difficultyRangeOption.value || undefined,
    difficultyMin: manualDifficultyMin ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : undefined),
    difficultyMax: manualDifficultyMax ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : undefined),
    domain: domainValue,
    quality: qualityValue,
    progress: user && progressValue !== "unsolved" ? progressValue : undefined,
    ownership: user && ownershipValue !== "all" ? ownershipValue : undefined,
    solutions: solutionValue !== defaultSolutionValue ? solutionValue : undefined,
    language: includesEveryLanguage ? undefined : languageValues,
    author: authorQuery || undefined,
    sort: sortValue === "newest" ? undefined : sortValue,
    filterLogic: advancedFilters.length ? advancedLogic : undefined,
    filterField: advancedFilters.map((filter) => filter.field),
    filterOp: advancedFilters.map((filter) => filter.op),
    filterValue: advancedFilters.map((filter) => filter.value),
    includeSpoilerTags: showSpoilerTags ? "1" : undefined,
    showAll: showAllProblems ? "1" : undefined
  };
  const progressPercent = progressTotal ? Math.round((progressSolved / progressTotal) * 100) : 0;
  const progressScope = domainValue ? translatedDomainLabel(domainValue, t) : t.common.allDomains;
  const difficultyRanges = t.problems.difficultyRanges;
  const sortOptions = t.problems.sortOptions;

  return (
    <div className="problems-page-shell">
      <section className="problems-hero">
        <img src="/art/hero-rye.jpg" alt="Ivan Shishkin, Rye (1878)" />
        <div className="problems-hero-overlay" />
        <div className="problems-hero-content">
          <div>
            <h1>{t.problems.title}</h1>
          </div>
          <div className="problems-hero-meta">
            <p>
              {t.problems.heroMeta(progressTotal)}
            </p>
            {user ? (
              <p>
                {t.problems.solvedProgress(progressSolved, progressScope, progressPercent)}
              </p>
            ) : (
              <p>{t.problems.signInProgress(progressScope)}</p>
            )}
            <div className="problems-hero-actions">
              <Link href="/problems/new" className="button">
                {t.problems.addProblem}
              </Link>
              <ContributionRequestDialog
                action={createContributionRequestAction.bind(null, "PROBLEM", "/problems")}
                buttonLabel={t.problems.requestProblem}
                title={t.problems.requestProblem}
                description={t.problems.requestProblemDescription}
                placeholder={t.problems.requestProblemPlaceholder}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="problems-workspace">
        <aside className="problems-filter-panel">
          <LiveSearchForm className="problem-filter-form" persistKey="problems">
            <label className="problem-filter-search">
              <span>{t.problems.searchProblems}</span>
              <input name="q" defaultValue={query} />
            </label>
            {domainValue && <input type="hidden" name="domain" value={domainValue} />}

            <div className="problem-filter-section">
              <p>{t.problems.difficulty}</p>
              <ProblemDifficultyFilter
                customBounds={hasCustomDifficultyBounds}
                initialMax={difficultyMaxValue}
                initialMin={difficultyMinValue}
                ranges={difficultyRanges}
                selectedRange={difficultyRangeSelectValue}
                labels={{
                  minimum: t.problems.minimumDifficulty,
                  maximum: t.problems.maximumDifficulty,
                  preset: t.problems.difficultyPreset,
                  custom: t.problems.customDifficulty
                }}
              />
            </div>

            <div className="problem-filter-section">
              <fieldset className="problem-language-filter">
                <legend>{t.problems.languages}</legend>
                {SUPPORTED_CONTENT_LANGUAGES.map((languageOption) => (
                  <label key={languageOption.code}>
                    <input
                      name="language"
                      type="checkbox"
                      value={languageOption.code}
                      defaultChecked={languageValues.includes(languageOption.code)}
                    />
                    <span>{languageOption.code.toUpperCase()}</span>
                  </label>
                ))}
              </fieldset>
            </div>

            <div className="problem-filter-section">
              <p>{t.problems.status}</p>
              {user && (
                <select name="progress" defaultValue={progressValue} aria-label={t.problems.solvedStatus}>
                  <option value="unsolved">{t.problems.unsolved}</option>
                  <option value="solved">{t.problems.solved}</option>
                  <option value="all">{t.problems.allProblems}</option>
                </select>
              )}
              {user && (
                <select name="ownership" defaultValue={ownershipValue} aria-label={t.problems.ownershipStatus}>
                  <option value="all">{t.problems.includeOwnProblems}</option>
                  <option value="mine">{t.problems.onlyOwnProblems}</option>
                  <option value="others">{t.problems.onlyOtherProblems}</option>
                </select>
              )}
              <select name="quality" defaultValue={qualityValue ?? ""}>
                <option value="">{t.problems.anyQuality}</option>
                <option value="NEEDS_WORK">{t.problems.needsWork}</option>
                {canSeeUnreviewedProblems && <option value="UNREVIEWED">{t.problems.unreviewed}</option>}
                <option value="GOOD">{t.problems.good}</option>
                <option value="EXCELLENT">{t.problems.excellent}</option>
              </select>
              <select name="solutions" defaultValue={solutionValue} aria-label={t.problems.solutionStatus}>
                <option value="with">{t.problems.withSolutions}</option>
                <option value="all">{t.problems.anySolutionStatus}</option>
                <option value="without">{t.problems.withoutSolutions}</option>
              </select>
              <label className="problem-filter-inline-field">
                <span>{t.problems.author}</span>
                <input name="author" defaultValue={authorQuery} placeholder={t.problems.authorPlaceholder} />
              </label>
              {sortValue !== "newest" && <input type="hidden" name="sort" value={sortValue} />}
              <label className="checkbox-inline">
                <input name="includeSpoilerTags" type="checkbox" value="1" defaultChecked={showSpoilerTags} />
                <span>{t.problems.includeSpoilers}</span>
              </label>
            </div>

            <ProblemFilterBuilder
              domains={FLAT_PROBLEM_DOMAIN_OPTIONS.map((item) => ({
                value: item.value,
                label: translatedDomainLabel(item.value, t)
              }))}
              initialFilters={advancedFilters}
              initialLogic={advancedLogic}
              labels={t.problems.advancedFilters}
              statuses={Object.values(QualityStatus)
                .filter((status) => canSeeUnreviewedProblems || status !== QualityStatus.UNREVIEWED)
                .map((status) => ({ value: status, label: t.quality[status] }))}
              tags={tags.map((item) => ({ value: item.slug, label: item.name }))}
            />
          </LiveSearchForm>
        </aside>

        <section className="problems-ledger" aria-label={t.problems.ariaLabel}>
          <div className="problems-ledger-header">
            <div>
              {totalProblems > 0 && (
                <p className="result-summary" role="status" aria-live="polite">
                  {t.problems.showingResults(totalProblems)}
                </p>
              )}
            </div>
            <ProblemSortControl
              ariaLabel={t.problems.sortAriaLabel}
              label={t.problems.sort}
              options={sortOptions}
              value={sortValue}
            />
          </div>

          <div className="problem-ledger-list">
            {problems.map((problem) => {
              const isOwnProblem = user?.id === problem.authorId;
              const groupSolvedUsers = solvedUsersByGroup.get(problem.translationGroupId) ?? new Set<number>();
              const groupFavoriteUsers = favoriteUsersByGroup.get(problem.translationGroupId) ?? new Set<number>();
              const isSolved = Boolean(user && groupSolvedUsers.has(user.id));
              const isOpened = !isSolved && openedTranslationGroupIds.has(problem.translationGroupId);
              const isUserFavorite = Boolean(!isOwnProblem && user && groupFavoriteUsers.has(user.id));
              const externalSolveCount = [...groupSolvedUsers].filter((userId) => userId !== problem.authorId).length;
              const externalFavoriteCount = [...groupFavoriteUsers].filter((userId) => userId !== problem.authorId).length;
              const revealSpoilerDomains = showSpoilerTags || isSolved;
              const visibleDomainCodes = problem.domains.length
                ? problem.domains
                    .filter((item) => revealSpoilerDomains || !item.spoiler)
                    .map((item) => item.mscCode)
                : [problem.domain];
              const hiddenDomainCount = revealSpoilerDomains ? 0 : problem.domains.filter((item) => item.spoiler).length;
              const difficulty = problem.difficulty ?? null;
              const difficultyLevel = problemDifficultyBars(difficulty);
              const tone = problemDifficultyTone(difficulty);
              const authorName = displayNameForUser(problem.author);
              const showLanguageBadge = problem.language !== preferredLanguage;

              return (
                <div
                  key={problem.id}
                  title={isOwnProblem ? t.problems.yourProblem : isUserFavorite ? t.problems.favoriteProblem : undefined}
                  className={`${problemLinkClass(
                    "problem-ledger-row",
                    isSolved ? "solved" : isOpened ? "opened" : null
                  )}${isOwnProblem ? " problem-own" : isUserFavorite ? " problem-favorite" : ""}`}
                >
                  <Link href={`/problems/${problem.slug}`} className="problem-ledger-content">
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
                      {showLanguageBadge && (
                        <span className="problem-language-badge" title={contentLanguageLabel(problem.language)}>
                          {problem.language.toUpperCase()}
                        </span>
                      )}
                    </h3>
                    <p>
                      {visibleDomainCodes.length
                        ? visibleDomainCodes.map((code) => translatedDomainLabel(code, t)).join(" · ")
                        : t.problems.domainHidden}
                      {hiddenDomainCount > 0 && visibleDomainCodes.length > 0 ? ` · ${t.problems.spoilerDomainHidden}` : ""} ·{" "}
                      {t.problems.solvedCount(externalSolveCount)} · {t.quality[problem.qualityStatus]}
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
                        <span className="meta">{t.problems.spoiler}</span>
                        {problem.spoilerTags.map(({ tag }) => (
                          <span key={tag.id} className="tag spoiler-tag">
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    </div>
                  </Link>
                  <div className="problem-ledger-side">
                    <Link
                      href={problemsHref({ ...paginationParams, author: authorName }) as never}
                      className="problem-ledger-author"
                      title={t.problems.filterByAuthor(authorName)}
                    >
                      {t.common.by} {authorName}
                    </Link>
                    {isOwnProblem && (
                      <span className="problem-favorite-count problem-own-count" title={t.problems.yourProblem}>
                        <House size={15} />
                      </span>
                    )}
                    <span
                      className={isUserFavorite ? "problem-favorite-count problem-favorite-count-own" : "problem-favorite-count"}
                      title={isUserFavorite ? t.problems.favoriteProblem : t.problems.favorites}
                    >
                      <Heart size={15} fill={isUserFavorite ? "currentColor" : "none"} />
                      {externalFavoriteCount}
                    </span>
                  </div>
                </div>
              );
            })}
            {problems.length === 0 && (
              <p className="empty-state">
                {t.problems.noMatches}
              </p>
            )}
          </div>

          {(totalPages > 1 || showAllProblems) && (
            <nav className="pagination" aria-label={t.problems.ariaLabel}>
              {!showAllProblems && currentPage > 1 ? (
                <Link href={problemsHref({ ...paginationParams, showAll: undefined, page: currentPage - 1 }) as never} aria-label={t.problems.previous}>
                  &larr;
                </Link>
              ) : (
                <span aria-disabled="true" aria-label={t.problems.previous}>
                  &larr;
                </span>
              )}
              <span className="pagination-status">
                {showAllProblems ? t.problems.showingAll : t.problems.pageStatus(currentPage, totalPages)}
              </span>
              {!showAllProblems && currentPage < totalPages ? (
                <Link href={problemsHref({ ...paginationParams, showAll: undefined, page: currentPage + 1 }) as never} aria-label={t.problems.next}>
                  &rarr;
                </Link>
              ) : (
                <span aria-disabled="true" aria-label={t.problems.next}>
                  &rarr;
                </span>
              )}
              {showAllProblems ? (
                <Link href={problemsHref({ ...paginationParams, showAll: undefined, page: undefined }) as never}>
                  {t.problems.showPages}
                </Link>
              ) : (
                <Link href={problemsHref({ ...paginationParams, showAll: "1", page: undefined }) as never}>
                  {t.problems.showAll}
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}
