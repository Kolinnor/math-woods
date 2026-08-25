export const CONTRIBUTION_TASK_KEYS = [
  "stub-concepts",
  "usable-concepts",
  "edited-concepts",
  "concepts-without-examples",
  "concepts-without-exercises",
  "concepts-without-references",
  "unreviewed-problems",
  "needs-work-problems",
  "exercises-without-concepts",
  "problems-missing-fr",
  "problems-missing-en",
  "concepts-missing-fr",
  "concepts-missing-en"
] as const;

export type ContributionTaskKey = (typeof CONTRIBUTION_TASK_KEYS)[number];
export type ProblemTranslationTaskKey = "problems-missing-fr" | "problems-missing-en";

type TranslatablePage = {
  language: string;
  slug: string;
  translationGroupId: string;
};

const contributionTaskKeySet = new Set<string>(CONTRIBUTION_TASK_KEYS);

export function parseContributionTaskKey(value: unknown): ContributionTaskKey | null {
  const normalized = String(value ?? "").trim();
  return contributionTaskKeySet.has(normalized) ? (normalized as ContributionTaskKey) : null;
}

export function parseProblemTranslationTaskKey(value: unknown): ProblemTranslationTaskKey | null {
  const task = parseContributionTaskKey(value);
  return task === "problems-missing-fr" || task === "problems-missing-en" ? task : null;
}

export function problemTranslationTaskTargetLanguage(task: ProblemTranslationTaskKey) {
  return task === "problems-missing-fr" ? "fr" : "en";
}

export function hasExamplesSection(markdown: string) {
  return /^#{1,6}[ \t]+(?:examples?|exemples?)(?:\s|$)/im.test(markdown);
}

export function translationSourcesMissingLanguage<T extends TranslatablePage>(pages: T[], targetLanguage: string) {
  const groups = new Map<string, T[]>();
  for (const page of pages) {
    groups.set(page.translationGroupId, [...(groups.get(page.translationGroupId) ?? []), page]);
  }

  return [...groups.values()].flatMap((group) => {
    if (group.some((page) => page.language === targetLanguage)) return [];
    const source = group.find((page) => page.language === (targetLanguage === "fr" ? "en" : "fr")) ?? group[0];
    return source ? [source] : [];
  });
}

export function translationGroupCount<T extends TranslatablePage>(pages: T[]) {
  return new Set(pages.map((page) => page.translationGroupId)).size;
}
