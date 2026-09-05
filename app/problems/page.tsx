import { MathDomain, Prisma, QualityStatus } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ContributionRequestDialog } from "@/components/ContributionRequestDialog";
import { FieldHelp } from "@/components/FieldHelp";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { ProblemLedgerInteractiveRow } from "@/components/ProblemLedgerInteractiveRow";
import { ProblemDomainStrip } from "@/components/ProblemDomainStrip";
import { ProblemFilterBuilder, type ProblemFilterRow } from "@/components/ProblemFilterBuilder";
import { ProblemDifficultyFilter } from "@/components/ProblemDifficultyFilter";
import { ProblemSortControl } from "@/components/ProblemSortControl";
import { RandomProblemButton } from "@/components/RandomProblemButton";
import { RecommendedProblemReader } from "@/components/RecommendedProblemReader";
import { UserAvatar } from "@/components/UserAvatar";
import { getCurrentUser } from "@/lib/auth";
import { createContributionRequestAction } from "@/lib/actions/contribution-request-actions";
import { distinctContentCountsByProblemGroup } from "@/lib/content-translation-counts";
import { prisma } from "@/lib/db";
import { hasTrustedPrivileges } from "@/lib/permissions";
import {
  domainCodeAliases,
  domainDescription,
  domainLabel,
  FLAT_PROBLEM_DOMAIN_OPTIONS,
  parseDomainCode,
  parentProblemDomainForCode,
  PROBLEM_DOMAIN_FAMILIES,
  PROBLEM_DOMAINS,
  translatedDomainLabel as translatedDomainOptionLabel,
  translatedDomainOptions
} from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { problemLinkClass } from "@/lib/problem-link";
import { selectProblemBrowserTranslation } from "@/lib/problem-browser-translations";
import { PROBLEM_STYLE_OPTIONS, parseProblemStyle, problemStyleLabel } from "@/lib/problem-styles";
import { renderInlineMarkdown } from "@/lib/markdown";
import {
  defaultProblemContentTypesForMathLevel,
  isDefaultProblemContentType,
  parseProblemContentTypes,
  problemContentTypeWhere
} from "@/lib/problem-content-types";
import { problemDifficultyBars, problemDifficultyTone } from "@/lib/problem-difficulty";
import { buildProgressMap } from "@/lib/progress";
import { recommendationsForUser } from "@/lib/recommendation-engine";
import { combineSearchFilters } from "@/lib/search-filters";
import { rankSearchMatches, searchDatabaseVariants, searchMorphologyVariants } from "@/lib/search-ranking";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { ensureSlug } from "@/lib/slug";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mathematics Problems and Exercises | Math Woods",
  description: "Browse free mathematics problems and exercises by subject, difficulty, and language on Math Woods."
};

const PROBLEMS_PER_PAGE = 14;
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

const SUPPORTED_LANGUAGE_CODES = ACTIVE_CONTENT_LANGUAGES.map((language) => language.code);
const SUPPORTED_LANGUAGE_CODE_SET = new Set(SUPPORTED_LANGUAGE_CODES);

const DIFFICULTY_RANGES: DifficultyRange[] = [
  { value: "", label: "Any difficulty" },
  { value: "1-10", label: "First steps / Middle school (1-10)", min: 1, max: 10 },
  { value: "10-25", label: "Beginner / High school (10-25)", min: 10, max: 25 },
  { value: "25-50", label: "Intermediate / Undergraduate (25-50)", min: 25, max: 50 },
  { value: "50-70", label: "Advanced / Graduate (50-70)", min: 50, max: 70 },
  { value: "70-90", label: "Expert / Specialized (70-90)", min: 70, max: 90 },
  { value: "90-100", label: "Research-level (90-100)", min: 90, max: 100 }
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "solved", label: "Most solved" },
  { value: "favorited", label: "Most liked" },
  { value: "difficulty", label: "Hardest first" },
  { value: "easiest", label: "Easiest first" }
];

function translatedDomainLabel(domain: MathDomain | string, t: Dictionary) {
  return translatedDomainOptionLabel(domain, t.home.domainLabels);
}

function parseProgressFilter(value: string | undefined): ProgressFilter {
  return value === "unsolved" || value === "solved" ? value : "all";
}

function parseOwnershipFilter(value: string | undefined): OwnershipFilter {
  return value === "mine" || value === "others" ? value : "all";
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

  if (filter.field === "style") {
    const style = parseProblemStyle(value);
    return style ? { styles: { has: style } } : null;
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
    style?: string;
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
    domainView?: string;
    filterLogic?: string;
    filterField?: SearchValue;
    filterOp?: SearchValue;
    filterValue?: SearchValue;
    includeSpoilerTags?: string;
    contentType?: SearchValue;
    tour?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const {
    q = "",
    tag = "",
    style = "",
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
    domainView = "",
    filterLogic = "AND",
    filterField,
    filterOp,
    filterValue,
    includeSpoilerTags = "",
    contentType,
    tour = ""
  } = await searchParams;
  const tourMode = tour === "1";
  const preferredLanguage = await getPreferredContentLanguage();
  const showSpoilerTags = includeSpoilerTags === "1" || includeSpoilerTags === "on";
  const showAllProblems = showAll === "1" || showAll === "on";
  const defaultContentTypeValues = defaultProblemContentTypesForMathLevel(user?.mathLevel);
  const contentTypeValues = parseProblemContentTypes(contentType, defaultContentTypeValues);
  const contentTypeWhere = problemContentTypeWhere(contentTypeValues);
  const showsProblems = contentTypeValues.includes("problem");
  const showsExercises = contentTypeValues.includes("exercise");
  const query = q.trim();
  const styleValue = parseProblemStyle(style);
  const morphologyVariants = searchMorphologyVariants(query, preferredLanguage);
  const databaseSearchVariants = searchDatabaseVariants(query, morphologyVariants);
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
  const progressValue = tourMode ? "all" : parseProgressFilter(progress);
  const ownershipValue = user ? parseOwnershipFilter(ownership) : "all";
  const languageValues = parseLanguageFilters(language);
  const includesEveryLanguage = languageValues.length === SUPPORTED_LANGUAGE_CODES.length;
  const languageWhere: Prisma.ProblemWhereInput = { language: { in: languageValues } };
  const defaultSolutionValue: SolutionFilter = "all";
  const solutionValue = parseSolutionFilter(solutions, defaultSolutionValue);
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
  const isTrustedViewer = user ? hasTrustedPrivileges(user.role) : false;
  const hasExplicitStatusFilter = Boolean(qualityValue) || advancedFilters.some((filter) => filter.field === "status");
  const qualityWhereClause: Prisma.ProblemWhereInput | undefined = qualityValue
    ? { qualityStatus: qualityValue }
    : hasExplicitStatusFilter || isTrustedViewer
      ? undefined
      : user
        ? { OR: [{ qualityStatus: QualityStatus.REVIEWED }, { authorId: user.id }] }
        : { qualityStatus: QualityStatus.REVIEWED };
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
    for (const variant of databaseSearchVariants) {
      queryClauses.push(
        { title: { contains: variant, mode: "insensitive" } },
        { bodyMarkdown: { contains: variant, mode: "insensitive" } },
        { origin: { contains: variant, mode: "insensitive" } },
        { tags: { some: { tag: { name: { contains: variant, mode: "insensitive" } } } } }
      );
    }
    if (queryTagSlug) {
      queryClauses.push({ slug: { contains: queryTagSlug } });
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
    ...(contentTypeWhere ? [contentTypeWhere] : []),
    ...(queryClauses.length ? [{ OR: queryClauses } satisfies Prisma.ProblemWhereInput] : []),
    ...(tagSlug ? [tagWhere(tagSlug, showSpoilerTags)].filter((item): item is Prisma.ProblemWhereInput => Boolean(item)) : []),
    ...(styleValue ? [{ styles: { has: styleValue } }] : []),
    ...(difficultyWhere ? [difficultyWhere] : []),
    ...(domainValue ? [domainWhere(domainValue, showSpoilerTags)] : []),
    ...(qualityWhereClause ? [qualityWhereClause] : []),
    ...(progressFilterWhere ? [progressFilterWhere] : []),
    ...(ownershipWhere ? [ownershipWhere] : []),
    ...(solutionWhere ? [solutionWhere] : []),
    languageWhere,
    ...(authorWhere ? [authorWhere] : []),
    ...(advancedClauses.length
      ? [{ [advancedLogic]: advancedClauses } satisfies Prisma.ProblemWhereInput]
      : [])
  ];
  const where: Prisma.ProblemWhereInput = combineSearchFilters<Prisma.ProblemWhereInput>(baseWhereClauses);
  const progressWhere: Prisma.ProblemWhereInput = {
    status: "PUBLISHED",
    listed: true,
    ...(contentTypeWhere ?? {}),
    ...languageWhere,
    ...(ownershipWhere ?? {}),
    ...(authorWhere ?? {}),
    ...(domainValue ? domainWhere(domainValue, showSpoilerTags) : {})
  };
  const domainProgressWhere: Prisma.ProblemWhereInput = {
    status: "PUBLISHED",
    listed: true,
    ...(contentTypeWhere ?? {}),
    ...languageWhere,
    ...(ownershipWhere ?? {})
  };

  const [progressProblemGroups, domainProgressProblemGroups, problemCandidateKeys] = await Promise.all([
    prisma.problem.findMany({
      where: progressWhere,
      distinct: ["translationGroupId"],
      select: { translationGroupId: true }
    }),
    prisma.problem.findMany({
      where: domainProgressWhere,
      distinct: ["translationGroupId"],
      select: {
        translationGroupId: true,
        isExercise: true,
        domain: true,
        domains: {
          where: { spoiler: false },
          orderBy: { position: "asc" },
          select: { domain: true, mscCode: true }
        }
      }
    }),
    prisma.problem.findMany({
      where,
      orderBy,
      select: {
        id: true,
        slug: true,
        title: true,
        bodyMarkdown: true,
        origin: true,
        styles: true,
        tags: { select: { tag: { select: { name: true } } } },
        spoilerTags: { select: { tag: { select: { name: true } } } },
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
  const domainProgress = Object.fromEntries(
    buildProgressMap(
      domainProgressProblemGroups,
      solvedTranslationGroupIdSet,
      (problem) =>
        parentProblemDomainForCode(problem.domains[0]?.mscCode ?? problem.domains[0]?.domain ?? problem.domain)?.value ?? "other"
    )
  );
  const domainProblemCounts = Object.fromEntries(
    Object.entries(domainProgress).map(([domain, entry]) => [domain, entry.total])
  );
  const domainContentTypeCounts = Object.fromEntries(
    Object.entries(
      domainProgressProblemGroups.reduce<Record<string, { problems: number; exercises: number }>>((counts, problem) => {
        const domain = parentProblemDomainForCode(problem.domains[0]?.mscCode ?? problem.domains[0]?.domain ?? problem.domain)?.value
          ?? "other";
        const entry = counts[domain] ?? { problems: 0, exercises: 0 };
        if (problem.isExercise) entry.exercises += 1;
        else entry.problems += 1;
        counts[domain] = entry;
        return counts;
      }, {})
    )
  );
  const candidateTranslationGroupIds = [...new Set(problemCandidateKeys.map((problem) => problem.translationGroupId))];
  const displayCandidateKeys = candidateTranslationGroupIds.length
    ? await prisma.problem.findMany({
        where: {
          translationGroupId: { in: candidateTranslationGroupIds },
          status: "PUBLISHED",
          listed: true,
          ...(qualityWhereClause ?? {}),
          language: { in: languageValues }
        },
        select: {
          id: true,
          slug: true,
          title: true,
          bodyMarkdown: true,
          origin: true,
          styles: true,
          tags: { select: { tag: { select: { name: true } } } },
          spoilerTags: { select: { tag: { select: { name: true } } } },
          translationGroupId: true,
          language: true,
          translatedFromProblemId: true
        }
      })
    : [];
  const candidatesByTranslationGroup = new Map<string, typeof displayCandidateKeys>();
  for (const candidate of displayCandidateKeys) {
    candidatesByTranslationGroup.set(candidate.translationGroupId, [
      ...(candidatesByTranslationGroup.get(candidate.translationGroupId) ?? []),
      candidate
    ]);
  }
  const selectedCandidateByGroup = new Map(
    [...candidatesByTranslationGroup].flatMap(([translationGroupId, candidates]) => {
      const selected = selectProblemBrowserTranslation(candidates, preferredLanguage, languageValues);
      return selected ? [[translationGroupId, selected] as const] : [];
    })
  );
  const matchedCandidatesByTranslationGroup = new Map<string, typeof problemCandidateKeys>();
  for (const candidate of problemCandidateKeys) {
    matchedCandidatesByTranslationGroup.set(candidate.translationGroupId, [
      ...(matchedCandidatesByTranslationGroup.get(candidate.translationGroupId) ?? []),
      candidate
    ]);
  }
  const matchedProblemOrder = new Map(problemCandidateKeys.map((problem, index) => [problem.id, index]));
  const orderedTranslationGroupIds = query
    ? [...new Set(rankSearchMatches(
        problemCandidateKeys.map((problem) => ({
          item: problem,
          title: problem.title,
          slug: problem.slug,
          language: problem.language,
          searchText: [
            problem.bodyMarkdown,
            problem.origin,
            ...problem.styles.map((problemStyle) => problemStyleLabel(problemStyle, interfaceLocale)),
            ...problem.tags.map(({ tag }) => tag.name),
            ...(showSpoilerTags ? problem.spoilerTags.map(({ tag }) => tag.name) : [])
          ]
        })),
        query,
        preferredLanguage,
        morphologyVariants,
        (left, right) => (matchedProblemOrder.get(left.item.id) ?? 0) - (matchedProblemOrder.get(right.item.id) ?? 0)
      ).map(({ item }) => item.translationGroupId))]
    : [...matchedCandidatesByTranslationGroup.keys()];
  const dedupedProblems = orderedTranslationGroupIds.flatMap((translationGroupId) => {
    const selected = selectedCandidateByGroup.get(translationGroupId);
    return selected ? [selected] : [];
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
          domains: { orderBy: { position: "asc" } }
        }
      })
    : [];
  const problemById = new Map(pageProblems.map((problem) => [problem.id, problem]));
  const problems = pageProblemIds.flatMap((problemId) => {
    const problem = problemById.get(problemId);
    return problem ? [problem] : [];
  });
  const displayedTranslationGroupIds = problems.map((problem) => problem.translationGroupId);
  const [groupAttempts, groupFavorites, groupProofs, groupHints] = displayedTranslationGroupIds.length
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
        }),
        prisma.problemProof.findMany({
          where: { problem: { translationGroupId: { in: displayedTranslationGroupIds } } },
          select: {
            translationGroupId: true,
            problem: { select: { translationGroupId: true } }
          }
        }),
        prisma.problemHint.findMany({
          where: { problem: { translationGroupId: { in: displayedTranslationGroupIds } } },
          select: {
            translationGroupId: true,
            problem: { select: { translationGroupId: true } }
          }
        })
      ])
    : [[], [], [], []];
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
  const solutionCountByGroup = distinctContentCountsByProblemGroup(groupProofs);
  const hintCountByGroup = distinctContentCountsByProblemGroup(groupHints);
  const paginationParams = {
    q: query,
    tag: tagSlug,
    style: styleValue ?? undefined,
    difficultyRange: difficultyRangeOption.value || undefined,
    difficultyMin: manualDifficultyMin ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : undefined),
    difficultyMax: manualDifficultyMax ?? (legacyDifficultyValue && !difficultyRangeOption.value ? legacyDifficultyValue : undefined),
    domain: domainValue,
    quality: qualityValue,
    progress: user && progressValue !== "all" ? progressValue : undefined,
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
    contentType: isDefaultProblemContentType(contentTypeValues, defaultContentTypeValues) ? undefined : contentTypeValues,
    showAll: showAllProblems ? "1" : undefined
  };
  const progressPercent = progressTotal ? Math.round((progressSolved / progressTotal) * 100) : 0;
  const progressScope = domainValue ? translatedDomainLabel(domainValue, t) : t.common.allDomains;
  const difficultyRanges = t.problems.difficultyRanges;
  const sortOptions = t.problems.sortOptions;
  const heroTitle = showsExercises && !showsProblems
    ? t.problems.exerciseType
    : showsExercises
      ? t.problems.mixedTitle
      : t.problems.title;
  const heroMeta = showsExercises && !showsProblems
    ? t.problems.exerciseHeroMeta(progressTotal)
    : showsExercises
      ? t.problems.mixedHeroMeta(progressTotal)
      : t.problems.heroMeta(progressTotal);
  const resultSummary = showsExercises && !showsProblems
    ? t.problems.showingExercises(totalProblems)
    : showsExercises
      ? t.problems.showingProblemsAndExercises(totalProblems)
      : t.problems.showingResults(totalProblems);
  const recommendationData = user ? await recommendationsForUser(user.id, 5, interfaceLocale) : null;
  const recommendationItems = await Promise.all(
    (recommendationData?.recommendations ?? []).map(async ({ problem }) => ({
      id: problem.id,
      slug: problem.slug,
      title: problem.title,
      titleHtml: await renderInlineMarkdown(problem.title),
      bodyHtml: problem.bodyHtml,
      difficulty: problem.difficulty,
      domain: translatedDomainLabel(problem.domains[0] ?? "OTHER", t),
      isExercise: problem.isExercise
    }))
  );

  return (
    <div className="problems-page-shell">
      <section className="problems-hero">
        <img src="/art/hero-rye.jpg" alt="Ivan Shishkin, Rye (1878)" />
        <div className="problems-hero-overlay" />
        <div className="problems-hero-content">
          <div className="problems-hero-heading">
            <h1>{heroTitle}</h1>
            <p className="problems-hero-summary">
              {heroMeta}
              {user
                ? ` · ${t.problems.solvedProgress(progressSolved, progressScope, progressPercent)}`
                : ""}
            </p>
          </div>
          <div className="problems-hero-actions">
            <Link href="/problems/new" className="button">
              {t.problems.addProblem}
            </Link>
            <ContributionRequestDialog
              action={createContributionRequestAction.bind(null, "PROBLEM", "/problems")}
              buttonLabel={t.problems.requestProblem}
              closeLabel={t.contributingPage.closeRequestDialog}
              title={t.problems.requestProblem}
              description={t.problems.requestProblemDescription}
              placeholder={t.problems.requestProblemPlaceholder}
              submitLabel={t.contributingPage.sendRequest}
            />
          </div>
        </div>
      </section>

      {recommendationItems.length > 0 && (
        <section className="problems-recommendations">
          <div className="problems-recommendations-heading">
            <h2>{interfaceLocale === "fr" ? "Recommandés pour vous" : "Recommended for you"}</h2>
          </div>
          <RecommendedProblemReader
            items={recommendationItems}
            labels={{
              open: t.problems.openRecommendation,
              previous: t.problems.previousRecommendation,
              next: t.problems.nextRecommendation,
              menu: t.problems.recommendationMenu,
              notInterested: t.problems.notInterested,
              report: t.problemDetail.report,
              hidden: t.problems.recommendationHidden,
              undo: t.problems.undo,
              tellUsWhy: t.problems.tellUsWhy,
              whyTitle: t.problems.whyNotInterested,
              tooHard: t.problems.recommendationTooHard,
              tooEasy: t.problems.recommendationTooEasy,
              alreadyKnown: t.problems.recommendationAlreadyKnown,
              notInterestedInDomain: t.problems.notInterestedInDomain,
              fewerLikeThis: t.problems.fewerLikeThis,
              thanks: t.problems.feedbackThanks,
              updateFailed: t.problems.recommendationUpdateFailed
            }}
          />
        </section>
      )}

      <ProblemDomainStrip
        domains={translatedDomainOptions(PROBLEM_DOMAINS, t.home.domainLabels)}
        families={PROBLEM_DOMAIN_FAMILIES}
        initiallyExpanded={domainView === "all"}
        labels={t.problems.domainBrowser}
        locale={interfaceLocale}
        problemCounts={domainProblemCounts}
        contentTypeCounts={showsProblems && showsExercises ? domainContentTypeCounts : undefined}
        progress={domainProgress}
        selectedDomain={domainValue}
      />

      <div className="problems-workspace" data-tour-target="problem-browser">
        <aside className="problems-filter-panel">
          <LiveSearchForm
            className="problem-filter-form"
            persistKey="problems"
            resetLabel={t.problems.resetFilters}
          >
            <label className="problem-filter-search">
              <span>{t.problems.searchProblems}</span>
              <input name="q" defaultValue={query} />
            </label>
            <RandomProblemButton
              label={t.problems.randomProblem}
              slugs={dedupedProblems.map((problem) => problem.slug)}
            />
            {domainValue && <input type="hidden" name="domain" value={domainValue} />}
            {styleValue && <input type="hidden" name="style" value={styleValue} />}

            <div className="problem-filter-section">
              <fieldset className="problem-language-filter">
                <legend className="problem-content-filter-legend">
                  {t.problems.contentTypes}
                  <FieldHelp text={t.problems.exerciseTypeHelp} />
                </legend>
                <label>
                  <input
                    name="contentType"
                    type="checkbox"
                    value="problem"
                    defaultChecked={showsProblems}
                  />
                  <span>{t.problems.problemType}</span>
                </label>
                <label>
                  <input
                    name="contentType"
                    type="checkbox"
                    value="exercise"
                    defaultChecked={showsExercises}
                  />
                  <span>{t.problems.exerciseType}</span>
                </label>
              </fieldset>
            </div>

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
                {ACTIVE_CONTENT_LANGUAGES.map((languageOption) => (
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
                <option value="UNREVIEWED">{t.problems.unreviewed}</option>
                <option value="REVIEWED">{t.problems.reviewed}</option>
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
                .map((status) => ({ value: status, label: t.quality[status] }))}
              styles={PROBLEM_STYLE_OPTIONS.map((problemStyle) => ({
                value: problemStyle,
                label: problemStyleLabel(problemStyle, interfaceLocale)
              }))}
            />
          </LiveSearchForm>
        </aside>

        <section className="problems-ledger" aria-label={t.problems.ariaLabel}>
          <div className="problems-ledger-header">
            <div>
              {totalProblems > 0 && (
                <p className="result-summary" role="status" aria-live="polite">
                  {resultSummary}
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
            {problems.map((problem, problemIndex) => {
              const isOwnProblem = user?.id === problem.authorId;
              const groupSolvedUsers = solvedUsersByGroup.get(problem.translationGroupId) ?? new Set<number>();
              const groupFavoriteUsers = favoriteUsersByGroup.get(problem.translationGroupId) ?? new Set<number>();
              const isSolved = Boolean(user && groupSolvedUsers.has(user.id));
              const isOpened = !isSolved && openedTranslationGroupIds.has(problem.translationGroupId);
              const isUserFavorite = Boolean(!isOwnProblem && user && groupFavoriteUsers.has(user.id));
              const groupSolutionCount = solutionCountByGroup.get(problem.translationGroupId) ?? 0;
              const groupHintCount = hintCountByGroup.get(problem.translationGroupId) ?? 0;
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
              const problemHref = `/problems/${problem.slug}`;

              return (
                <ProblemLedgerInteractiveRow
                  key={problem.id}
                  author={(
                    <div className="problem-ledger-author-row">
                      <Link
                        href={problemsHref({ ...paginationParams, author: authorName }) as never}
                        className="problem-ledger-author"
                        title={t.problems.filterByAuthor(authorName)}
                      >
                        {t.common.by} {authorName}
                      </Link>
                      <Link
                        href={`/profile/${problem.author.profileSlug}`}
                        className="problem-ledger-author-avatar"
                        title={authorName}
                        aria-label={authorName}
                      >
                        <UserAvatar user={problem.author} size="xs" />
                      </Link>
                    </div>
                  )}
                  className={`${problemLinkClass("problem-ledger-row")}${isOwnProblem ? " problem-own" : ""}`}
                  favoriteCount={externalFavoriteCount}
                  initialAttempted={isOpened}
                  initialFavorite={isUserFavorite}
                  initialSolved={isSolved}
                  isConjecture={problem.isConjecture}
                  isOwnProblem={isOwnProblem}
                  labels={{
                    addFavorite: t.problemDetail.addFavorite,
                    attempted: t.problemDetail.attempted,
                    favoriteProblem: t.problems.favoriteProblem,
                    favorites: t.problems.favorites,
                    markSolved: t.problemDetail.markSolved,
                    removeFavorite: t.problemDetail.removeFavorite,
                    startAttempting: t.problemDetail.startAttempting,
                    unmarkSolved: t.problemDetail.unmarkSolved,
                    updateFailed: t.problems.browserUpdateFailed,
                    yourProblem: t.problems.yourProblem
                  }}
                  problemId={problem.id}
                  problemSlug={problem.slug}
                  requiresVerification={problem.verificationMode !== "NONE" && !isOwnProblem}
                  signedIn={Boolean(user)}
                >
                  <Link
                    href={problemHref as never}
                    className="problem-ledger-content"
                    data-tour-target={problemIndex === 0 ? "open-problem" : undefined}
                  >
                  <div className="problem-ledger-difficulty" style={{ color: tone }}>
                    <span>{difficulty ? String(difficulty).padStart(2, "0") : "--"}</span>
                    <span className="problem-ledger-bars" aria-hidden="true">
                      {[1, 2, 3, 4, 5, 6].map((level) => (
                        <i key={level} style={{ background: level <= difficultyLevel ? tone : undefined }} />
                      ))}
                    </span>
                  </div>
                  <div className="problem-ledger-main">
                    <div className="problem-ledger-title-row">
                      <h3>
                        <AsyncMarkdownInline markdown={problem.title} />
                        <ContentLanguageFallback language={problem.language} expectedLanguage={preferredLanguage} />
                        {problem.canAppearOnFrontPage && <span className="problem-language-badge">{t.problems.featured}</span>}
                        {problem.isExercise && <span className="problem-language-badge">{t.problems.exerciseType}</span>}
                      </h3>
                      <span
                        className={`problem-review-badge problem-review-${problem.qualityStatus.toLowerCase()}`}
                      >
                        {t.quality[problem.qualityStatus]}
                      </span>
                      {problem.needsReviewAfterEdit && (
                        <span className="problem-review-badge problem-review-edited">
                          {t.problems.editedSinceReview}
                        </span>
                      )}
                    </div>
                    <div className="problem-ledger-meta-row">
                      <span className="problem-ledger-domain">
                        {visibleDomainCodes.length
                          ? visibleDomainCodes.map((code) => translatedDomainLabel(code, t)).join(" · ")
                          : t.problems.domainHidden}
                        {hiddenDomainCount > 0 && visibleDomainCodes.length > 0 ? ` · ${t.problems.spoilerDomainHidden}` : ""}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="problem-ledger-solve-count">{t.problems.solutionsCount(groupSolutionCount)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="problem-ledger-solve-count">{t.problems.hintsCount(groupHintCount)}</span>
                    </div>
                    </div>
                  </Link>
                </ProblemLedgerInteractiveRow>
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
