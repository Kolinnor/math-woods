import type { LatexRange } from "./latex-ranges.ts";

export type LatexPreviewRenderMode = "display" | "inline";

export function rangeIsStandaloneLine(text: string, from: number, to: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const nextBreak = text.indexOf("\n", to);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;

  return text.slice(lineStart, from).trim() === "" && text.slice(to, lineEnd).trim() === "";
}

export function latexPreviewRenderMode(text: string, range: LatexRange): LatexPreviewRenderMode {
  return range.displayMode && rangeIsStandaloneLine(text, range.from, range.to) ? "display" : "inline";
}
