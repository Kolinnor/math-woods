import { findLatexRanges } from "./latex-ranges.ts";

export type LatexArrowDirection = "backward" | "forward";

function openingDelimiterLength(text: string, from: number) {
  return text.startsWith("$$", from) || text.startsWith("\\(", from) || text.startsWith("\\[", from) ? 2 : 1;
}

function closingDelimiterLength(text: string, to: number) {
  return text.slice(Math.max(0, to - 2), to) === "$$" ||
    text.slice(Math.max(0, to - 2), to) === "\\)" ||
    text.slice(Math.max(0, to - 2), to) === "\\]"
    ? 2
    : 1;
}

export function latexCursorTargetForArrow(text: string, cursor: number, direction: LatexArrowDirection) {
  const range = findLatexRanges(text).find((item) => (direction === "backward" ? item.to === cursor : item.from === cursor));
  if (!range) return null;

  return direction === "backward"
    ? range.to - closingDelimiterLength(text, range.to)
    : range.from + openingDelimiterLength(text, range.from);
}
