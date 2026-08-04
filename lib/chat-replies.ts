export type ChatReplyPreview = {
  authorId: number;
  authorName: string;
  bodyMarkdown: string;
  hasImage: boolean;
  id: number;
};

export function normalizeChatReplyToId(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
