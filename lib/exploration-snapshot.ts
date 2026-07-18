export type ExplorationSnapshotOption = {
  id: number;
  action: "STAY" | "PAGE" | "REVEAL";
  label: string;
  value: string | null;
  feedbackHtml: string | null;
  isCorrect: boolean | null;
  revealBranchId: number | null;
  toPageId: number | null;
  effects: unknown;
  position: number;
};

export type ExplorationSnapshotOutcome = {
  id: number;
  kind: "ANSWER" | "CORRECT" | "INCORRECT" | "COMBINATION";
  label: string;
  toPageId: number | null;
  position: number;
  matches: Array<{ optionId: number }>;
};

export type ExplorationSnapshotBlock = {
  id: number;
  branchId: number | null;
  key: string;
  kind: string;
  title: string | null;
  bodyMarkdown: string | null;
  bodyHtml: string | null;
  explanationHtml: string | null;
  position: number;
  quizType: string | null;
  settings: unknown;
  visibilityRule: unknown;
  required: boolean;
  points: number;
  problem: {
    id: number;
    slug: string;
    title: string;
    difficulty: number | null;
    authorId: number;
    qualityStatus: string;
    translationGroupId: string;
  } | null;
  concept: { id: number; slug: string; title: string; translationGroupId: string } | null;
  options: ExplorationSnapshotOption[];
  outcomes: ExplorationSnapshotOutcome[];
};

export type ExplorationSnapshotPage = {
  id: number;
  key: string;
  slug: string;
  title: string;
  summary: string | null;
  position: number;
  isStart: boolean;
  isEnd: boolean;
  canvasX: number | null;
  canvasY: number | null;
  continueToPageId: number | null;
  visibilityRule: unknown;
  blocks: ExplorationSnapshotBlock[];
};

export function explorationSnapshotPages(snapshot: unknown): ExplorationSnapshotPage[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const pages = (snapshot as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return [];
  const validPages = pages.filter((page): page is ExplorationSnapshotPage => {
    if (!page || typeof page !== "object" || Array.isArray(page)) return false;
    const candidate = page as Partial<ExplorationSnapshotPage>;
    return typeof candidate.id === "number" && typeof candidate.key === "string" && Array.isArray(candidate.blocks);
  });
  const configuredEnd = validPages.find((page) => page.isEnd === true);
  const fallbackEnd = configuredEnd
    ? null
    : validPages.reduce<ExplorationSnapshotPage | null>(
        (last, page) => !last || page.position > last.position ? page : last,
        null
      );
  return validPages.map((page) => ({
    ...page,
    blocks: page.blocks.map((block) => ({
      ...block,
      branchId: typeof block.branchId === "number" ? block.branchId : null,
      options: block.options.map((option) => ({
        ...option,
        action: option.action === "REVEAL" || option.action === "PAGE"
          ? option.action
          : option.toPageId !== null
            ? "PAGE"
            : "STAY",
        revealBranchId: typeof option.revealBranchId === "number" ? option.revealBranchId : null
      })),
      outcomes: Array.isArray(block.outcomes) ? block.outcomes : []
    })),
    canvasX: typeof page.canvasX === "number" ? page.canvasX : null,
    canvasY: typeof page.canvasY === "number" ? page.canvasY : null,
    continueToPageId: typeof page.continueToPageId === "number" ? page.continueToPageId : null,
    isEnd: page.id === (configuredEnd?.id ?? fallbackEnd?.id)
  }));
}

export function findSnapshotBlock(snapshot: unknown, pageKey: string, blockKey: string) {
  const page = explorationSnapshotPages(snapshot).find((candidate) => candidate.key === pageKey);
  const block = page?.blocks.find((candidate) => candidate.key === blockKey);
  return page && block ? { page, block } : null;
}
