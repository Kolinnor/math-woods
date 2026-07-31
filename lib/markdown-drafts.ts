export type MarkdownDraft = {
  value: string;
  updatedAt: number;
  baseValue?: string;
};

export function markdownDraftConflictsWithSource(
  draft: MarkdownDraft,
  sourceValue: string,
  sourceUpdatedAt?: number | null
) {
  if (draft.value === sourceValue) return false;
  if (typeof draft.baseValue === "string" && draft.baseValue !== sourceValue) return true;
  return typeof sourceUpdatedAt === "number" && sourceUpdatedAt > draft.updatedAt;
}
