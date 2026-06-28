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

  return null;
}

export const latexBoundaryDeleteChange = latexDeleteChange;
