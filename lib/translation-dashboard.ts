import { SourceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SUPPORTED_CONTENT_LANGUAGES, contentLanguageLabel } from "@/lib/languages";

type TranslationDashboardPage = {
  href: string;
  language: string;
  title: string;
  type: "Concept" | "Problem";
};

type TranslationGap = {
  existingLanguages: string[];
  href: string;
  missingLanguageLinks: { href: string; label: string }[];
  missingLanguages: string[];
  title: string;
  type: "Concept" | "Problem";
};

type StaleTranslation = TranslationDashboardPage & {
  basedOnRevisionId: number | null;
  editHref: string;
  latestRevisionId: number;
  sourceHref: string;
  sourceTitle: string;
};

function missingLanguages(existingLanguages: string[]) {
  const existing = new Set(existingLanguages);
  return SUPPORTED_CONTENT_LANGUAGES.filter((language) => !existing.has(language.code));
}

export async function translationDashboard() {
  const [problems, concepts] = await Promise.all([
    prisma.problem.findMany({
      where: { status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        language: true,
        translationGroupId: true,
        translatedFromProblemId: true,
        translatedFromRevisionId: true
      }
    }),
    prisma.concept.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        language: true,
        translationGroupId: true,
        translatedFromConceptId: true,
        translatedFromRevisionId: true
      }
    })
  ]);

  const problemGroups = new Map<string, typeof problems>();
  for (const problem of problems) {
    problemGroups.set(problem.translationGroupId, [...(problemGroups.get(problem.translationGroupId) ?? []), problem]);
  }
  const conceptGroups = new Map<string, typeof concepts>();
  for (const concept of concepts) {
    conceptGroups.set(concept.translationGroupId, [...(conceptGroups.get(concept.translationGroupId) ?? []), concept]);
  }

  const gaps: TranslationGap[] = [
    ...[...problemGroups.values()].map((group) => {
      const anchor = group[0];
      const existingLanguages = [...new Set(group.map((item) => item.language))];
      const missing = missingLanguages(existingLanguages);
      return {
        existingLanguages,
        href: `/problems/${anchor.slug}`,
        missingLanguageLinks: missing.map((language) => ({
          href: `/problems/${anchor.slug}/translate?language=${language.code}`,
          label: contentLanguageLabel(language.code)
        })),
        missingLanguages: missing.map((language) => contentLanguageLabel(language.code)),
        title: anchor.title,
        type: "Problem" as const
      };
    }),
    ...[...conceptGroups.values()].map((group) => {
      const anchor = group[0];
      const existingLanguages = [...new Set(group.map((item) => item.language))];
      const missing = missingLanguages(existingLanguages);
      return {
        existingLanguages,
        href: `/concepts/${anchor.slug}`,
        missingLanguageLinks: missing.map((language) => ({
          href: `/concepts/${anchor.slug}/translate?language=${language.code}`,
          label: contentLanguageLabel(language.code)
        })),
        missingLanguages: missing.map((language) => contentLanguageLabel(language.code)),
        title: anchor.title,
        type: "Concept" as const
      };
    })
  ]
    .filter((gap) => gap.missingLanguages.length > 0)
    .sort((a, b) => a.missingLanguages.length - b.missingLanguages.length || a.title.localeCompare(b.title))
    .slice(0, 30);

  const problemSourceIds = [
    ...new Set(problems.map((problem) => problem.translatedFromProblemId).filter((id): id is number => Boolean(id)))
  ];
  const conceptSourceIds = [
    ...new Set(concepts.map((concept) => concept.translatedFromConceptId).filter((id): id is number => Boolean(id)))
  ];
  const [problemSourceRevisions, conceptSourceRevisions, sourceProblems, sourceConcepts] = await Promise.all([
    problemSourceIds.length
      ? prisma.pageRevision.groupBy({
          by: ["pageId"],
          where: { pageType: SourceType.PROBLEM, pageId: { in: problemSourceIds } },
          _max: { id: true }
        })
      : Promise.resolve([]),
    conceptSourceIds.length
      ? prisma.pageRevision.groupBy({
          by: ["pageId"],
          where: { pageType: SourceType.CONCEPT, pageId: { in: conceptSourceIds } },
          _max: { id: true }
        })
      : Promise.resolve([]),
    problemSourceIds.length
      ? prisma.problem.findMany({
          where: { id: { in: problemSourceIds } },
          select: { id: true, slug: true, title: true }
        })
      : Promise.resolve([]),
    conceptSourceIds.length
      ? prisma.concept.findMany({
          where: { id: { in: conceptSourceIds } },
          select: { id: true, slug: true, title: true }
        })
      : Promise.resolve([])
  ]);
  const problemLatestRevision = new Map(problemSourceRevisions.map((item) => [item.pageId, item._max.id ?? 0]));
  const conceptLatestRevision = new Map(conceptSourceRevisions.map((item) => [item.pageId, item._max.id ?? 0]));
  const sourceProblemById = new Map(sourceProblems.map((problem) => [problem.id, problem]));
  const sourceConceptById = new Map(sourceConcepts.map((concept) => [concept.id, concept]));

  const staleTranslations: StaleTranslation[] = [
    ...problems.flatMap((problem) => {
      if (!problem.translatedFromProblemId) return [];
      const latestRevisionId = problemLatestRevision.get(problem.translatedFromProblemId) ?? 0;
      if (!problem.translatedFromRevisionId || latestRevisionId <= problem.translatedFromRevisionId) return [];
      const source = sourceProblemById.get(problem.translatedFromProblemId);
      if (!source) return [];
      return [
        {
          basedOnRevisionId: problem.translatedFromRevisionId,
          editHref: `/problems/${problem.slug}/edit`,
          href: `/problems/${problem.slug}`,
          language: problem.language,
          latestRevisionId,
          sourceHref: `/problems/${source.slug}`,
          sourceTitle: source.title,
          title: problem.title,
          type: "Problem" as const
        }
      ];
    }),
    ...concepts.flatMap((concept) => {
      if (!concept.translatedFromConceptId) return [];
      const latestRevisionId = conceptLatestRevision.get(concept.translatedFromConceptId) ?? 0;
      if (!concept.translatedFromRevisionId || latestRevisionId <= concept.translatedFromRevisionId) return [];
      const source = sourceConceptById.get(concept.translatedFromConceptId);
      if (!source) return [];
      return [
        {
          basedOnRevisionId: concept.translatedFromRevisionId,
          editHref: `/concepts/${concept.slug}/edit`,
          href: `/concepts/${concept.slug}`,
          language: concept.language,
          latestRevisionId,
          sourceHref: `/concepts/${source.slug}`,
          sourceTitle: source.title,
          title: concept.title,
          type: "Concept" as const
        }
      ];
    })
  ].slice(0, 30);

  return {
    gaps,
    staleTranslations,
    totals: {
      concepts: concepts.length,
      problems: problems.length,
      stale: staleTranslations.length,
      withMissingTranslations: gaps.length
    }
  };
}
