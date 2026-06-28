import type { LatexRange } from "./latex-ranges.ts";

export type LatexPreviewRenderMode = "display" | "inline";

export function latexPreviewRenderMode(_text: string, range: LatexRange): LatexPreviewRenderMode {
  return range.displayMode ? "display" : "inline";
}
