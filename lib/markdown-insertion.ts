export type MarkdownInsertionSpacing = "line" | "paragraph";

export function markdownInsertionText({
  before,
  after,
  markdown,
  spacing = "paragraph"
}: {
  before: string;
  after: string;
  markdown: string;
  spacing?: MarkdownInsertionSpacing;
}) {
  const separator = spacing === "line" ? "\n" : "\n\n";
  const prefix = before.trim() ? separator : "";
  const suffix = after.trim() ? separator : "";
  return `${prefix}${markdown}${suffix}`;
}
