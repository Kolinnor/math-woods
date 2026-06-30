import { findLatexRanges } from "./latex-ranges.ts";

export type LatexDeleteDirection = "backward" | "forward";

export type LatexDeleteChange = {
  from: number;
  to: number;
  anchor: number;
};

function latexRangeStartsAt(text: string, cursor: number) {
  return findLatexRanges(text).some((item) => item.from === cursor);
}

function lineBoundsAt(text: string, position: number) {
  const from = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextBreak = text.indexOf("\n", position);
  const to = nextBreak === -1 ? text.length : nextBreak;

  return { from, to };
}

function lineHasLatexRange(text: string, from: number, to: number) {
  return findLatexRanges(text).some((range) => range.from >= from && range.to <= to);
}

function adjacentLatexLineBreakDeleteChange(
  text: string,
  cursor: number,
  direction: LatexDeleteDirection
): LatexDeleteChange | null {
  if (direction === "backward") {
    if (cursor <= 0 || text[cursor - 1] !== "\n") return null;

    const currentLine = lineBoundsAt(text, cursor);
    const previousLine = lineBoundsAt(text, cursor - 1);
    if (!lineHasLatexRange(text, currentLine.from, currentLine.to) && !lineHasLatexRange(text, previousLine.from, previousLine.to)) {
      return null;
    }

    return {
      from: cursor - 1,
      to: cursor,
      anchor: cursor - 1
    };
  }

  if (cursor >= text.length || text[cursor] !== "\n") return null;

  const currentLine = lineBoundsAt(text, cursor);
  const nextLine = lineBoundsAt(text, cursor + 1);
  if (!lineHasLatexRange(text, currentLine.from, currentLine.to) && !lineHasLatexRange(text, nextLine.from, nextLine.to)) {
    return null;
  }

  return {
    from: cursor,
    to: cursor + 1,
    anchor: cursor
  };
}

export function latexDeleteChange(text: string, cursor: number, direction: LatexDeleteDirection): LatexDeleteChange | null {
  const range = findLatexRanges(text).find((item) => (direction === "backward" ? item.to === cursor : item.from === cursor));

  if (range && direction === "backward") {
    return {
      from: range.to - 1,
      to: range.to,
      anchor: range.to - 1
    };
  }

  if (range && direction === "forward") {
    return {
      from: range.from,
      to: range.from + 1,
      anchor: range.from
    };
  }

  if (direction === "backward" && latexRangeStartsAt(text, cursor)) {
    if (cursor > 0 && text[cursor - 1] === "\n") {
      return {
        from: cursor - 1,
        to: cursor,
        anchor: cursor - 1
      };
    }

    if (cursor === 0) {
      return { from: 0, to: 0, anchor: 0 };
    }
  }

  const lineBreakChange = adjacentLatexLineBreakDeleteChange(text, cursor, direction);
  if (lineBreakChange) return lineBreakChange;

  return null;
}

export const latexBoundaryDeleteChange = latexDeleteChange;
