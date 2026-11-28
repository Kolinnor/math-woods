import { AttemptStatus, ProblemVerificationMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import type { Dictionary } from "@/lib/i18n/types";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { renderInlineMarkdown } from "@/lib/markdown";
import { renderMarkdownForContentLanguage } from "@/lib/translated-markdown";
import { selectContentTranslation } from "@/lib/translation-routing";

export const IN_PROGRESS_PAGE_SIZE = 10;

export type InProgressProblemItem = {
  id: number;
  slug: string;
  translationGroupId: string;
  title: string;
  titleHtml: string;
  bodyHtml: string;
  domain: string;
  difficulty: number | null;
  isExercise: boolean;
  isConjecture: boolean;
  isOwnProblem: boolean;
  favorite: boolean;
  /** Solving needs the answer check on the problem page; the list cannot mark it solved directly. */
  requiresVerification: boolean;
};

export type InProgressProblemPage = {
  items: InProgressProblemItem[];
  total: number;
  hasMore: boolean;
};

const VISIBLE_PROBLEM_WHERE = {
  status: "PUBLISHED",
  listed: true,
  language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) }
} as const;

/**
 * Translation families the user has opened but not solved, most recently touched first.
 * One entry per family: attempts are stored for every translation of a problem.
 */
async function inProgressTranslationGroups(userId: number) {
  const attempts = await prisma.problemAttempt.findMany({
    where: { userId, problem: VISIBLE_PROBLEM_WHERE },
    orderBy: { updatedAt: "desc" },
    select: { status: true, problem: { select: { translationGroupId: true } } }
  });
  const solvedGroups = new Set(
    attempts
      .filter((attempt) => attempt.status === AttemptStatus.SOLVED)
      .map((attempt) => attempt.problem.translationGroupId)
  );
  const groups: string[] = [];
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const groupId = attempt.problem.translationGroupId;
    if (solvedGroups.has(groupId) || seen.has(groupId)) continue;
    seen.add(groupId);
    groups.push(groupId);
  }
  return groups;
}

export async function inProgressProblemsForUser(
  user: { id: number },
  t: Dictionary,
  preferredLanguage: string,
  offset = 0,
  limit = IN_PROGRESS_PAGE_SIZE
): Promise<InProgressProblemPage> {
  const groups = await inProgressTranslationGroups(user.id);
  const start = Math.max(0, offset);
  const pageGroups = groups.slice(start, start + Math.max(1, limit));
  if (!pageGroups.length) return { items: [], total: groups.length, hasMore: false };

  const [translations, favorites] = await Promise.all([
    prisma.problem.findMany({
      where: { ...VISIBLE_PROBLEM_WHERE, translationGroupId: { in: pageGroups } },
      select: {
        id: true,
        slug: true,
        title: true,
        bodyMarkdown: true,
        language: true,
        createdAt: true,
        translationGroupId: true,
        translatedFromProblemId: true,
        difficulty: true,
        domain: true,
        isExercise: true,
        isConjecture: true,
        authorId: true,
        verificationMode: true
      }
    }),
    prisma.problemFavorite.findMany({
      where: { userId: user.id, problem: { translationGroupId: { in: pageGroups } } },
      select: { problem: { select: { translationGroupId: true } } }
    })
  ]);
  const favoriteGroups = new Set(favorites.map((favorite) => favorite.problem.translationGroupId));

  const items = await Promise.all(
    pageGroups.map(async (groupId) => {
      const problem = selectContentTranslation(
        translations
          .filter((translation) => translation.translationGroupId === groupId)
          .map((translation) => ({ ...translation, isSource: translation.translatedFromProblemId === null })),
        preferredLanguage
      );
      if (!problem) return null;
      const isOwnProblem = problem.authorId === user.id;
      const item: InProgressProblemItem = {
        id: problem.id,
        slug: problem.slug,
        translationGroupId: groupId,
        title: problem.title,
        titleHtml: await renderInlineMarkdown(problem.title),
        // Render from Markdown like the problem page: stored HTML can predate KaTeX or concept links.
        bodyHtml: await renderMarkdownForContentLanguage(problem.bodyMarkdown, problem.language),
        domain: translatedDomainLabel(problem.domain, t.home.domainLabels),
        difficulty: problem.difficulty,
        isExercise: problem.isExercise,
        isConjecture: problem.isConjecture,
        isOwnProblem,
        favorite: favoriteGroups.has(groupId),
        requiresVerification: !isOwnProblem && problem.verificationMode !== ProblemVerificationMode.NONE
      };
      return item;
    })
  );

  return {
    items: items.filter((item): item is InProgressProblemItem => item !== null),
    total: groups.length,
    hasMore: start + pageGroups.length < groups.length
  };
}
