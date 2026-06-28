import { findLatexRanges } from "./latex-ranges.ts";

export type LatexArrowDirection = "backward" | "forward";
export type LatexVerticalArrowDirection = "up" | "down";

type TextLine = {
  from: number;
  to: number;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lineAt(text: string, position: number): TextLine {
  const cursor = clamp(position, 0, text.length);
  const from = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const nextBreak = text.indexOf("\n", cursor);
  const to = nextBreak === -1 ? text.length : nextBreak;

  return { from, to };
}

function adjacentLine(text: string, cursor: number, direction: LatexVerticalArrowDirection): TextLine | null {
  const current = lineAt(text, cursor);

  if (direction === "down") {
    if (current.to >= text.length) return null;
    return lineAt(text, current.to + 1);
  }

  if (current.from === 0) return null;
  return lineAt(text, current.from - 1);
}

function lineIntersectsRange(line: TextLine, from: number, to: number) {
  return from < line.to && to > line.from;
}

function sourceTargetForLineColumn(text: string, line: TextLine, cursorColumn: number) {
  const targetColumn = line.from + cursorColumn;
  const ranges = findLatexRanges(text).filter((range) => lineIntersectsRange(line, range.from, range.to));
  if (!ranges.length) return null;

  const range =
    ranges.find((item) => targetColumn >= item.from && targetColumn <= item.to) ??
    ranges.reduce((closest, item) =>
      Math.abs(item.from - targetColumn) < Math.abs(closest.from - targetColumn) ? item : closest
    );
  const contentFrom = range.from + openingDelimiterLength(text, range.from);
  const contentTo = range.to - closingDelimiterLength(text, range.to);

  return clamp(targetColumn, contentFrom, contentTo);
}

export function latexCursorTargetForVerticalArrow(text: string, cursor: number, direction: LatexVerticalArrowDirection) {
  const current = lineAt(text, cursor);
  const target = adjacentLine(text, cursor, direction);
  if (!target) return null;

  return sourceTargetForLineColumn(text, target, cursor - current.from);
}
