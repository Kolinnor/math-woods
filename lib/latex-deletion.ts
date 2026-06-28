import { findLatexRanges } from "./latex-ranges.ts";

export type LatexDeleteDirection = "backward" | "forward";

export type LatexDeleteChange = {
  from: number;
  to: number;
  anchor: number;
};

export function latexBoundaryDeleteChange(text: string, cursor: number, direction: LatexDeleteDirection): LatexDeleteChange | null {
  const range = findLatexRanges(text).find((item) => (direction === "backward" ? item.to === cursor : item.from === cursor));
  if (!range) return null;

  if (direction === "backward") {
    return {
      from: range.to - 1,
      to: range.to,
      anchor: range.to - 1
    };
  }

  return {
    from: range.from,
    to: range.from + 1,
    anchor: range.from
  };
}
