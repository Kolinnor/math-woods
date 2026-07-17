import type { LatexRange } from "./latex-ranges.ts";

export type LatexPreviewRenderMode = "display" | "inline";
export type LatexPreviewLayoutKind = "inline" | "inline-display" | "block-display";
export type LatexPreviewDiagnosticSeverity = "info" | "warning" | "error";
export type LatexPreviewDiagnosticCode =
  | "display-math-inline-display-fallback"
  | "display-math-block-on-non-standalone-line"
  | "inline-math-with-block-layout";

export type LatexPreviewDiagnosticLine = {
  from: number;
  to: number;
  text: string;
  before: string;
  after: string;
};

export type LatexPreviewDiagnosticLayout = {
  kind: LatexPreviewLayoutKind;
  renderDisplayMode: boolean;
  useBlockLayout: boolean;
  standaloneLine: boolean;
};

export type LatexPreviewDiagnostic = {
  code: LatexPreviewDiagnosticCode;
  severity: LatexPreviewDiagnosticSeverity;
  message: string;
  from: number;
  to: number;
  formula: string;
  line: LatexPreviewDiagnosticLine;
  layout: LatexPreviewDiagnosticLayout;
};

export function rangeIsStandaloneLine(text: string, from: number, to: number) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, from - 1)) + 1;
  const nextBreak = text.indexOf("\n", to);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;

  return text.slice(lineStart, from).trim() === "" && text.slice(to, lineEnd).trim() === "";
}

export function latexPreviewRenderMode(_text: string, range: LatexRange): LatexPreviewRenderMode {
  return range.displayMode ? "display" : "inline";
}

export function latexPreviewUsesBlockDecoration(text: string, range: LatexRange) {
  void text;
  void range;
  return false;
}

export function latexPreviewUsesCenteredLine(text: string, range: LatexRange) {
  return range.displayMode && rangeIsStandaloneLine(text, range.from, range.to);
}

export function latexPreviewLayoutKind(renderDisplayMode: boolean, useBlockLayout: boolean): LatexPreviewLayoutKind {
  if (useBlockLayout) return "block-display";
  return renderDisplayMode ? "inline-display" : "inline";
}

export function latexPreviewLineContext(text: string, range: LatexRange): LatexPreviewDiagnosticLine {
  const lineStart = text.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const nextBreak = text.indexOf("\n", range.to);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;

  return {
    from: lineStart,
    to: lineEnd,
    text: text.slice(lineStart, lineEnd),
    before: text.slice(lineStart, range.from),
    after: text.slice(range.to, lineEnd)
  };
}

export function latexPreviewDiagnosticsForRange(
  text: string,
  range: LatexRange,
  renderDisplayMode: boolean,
  useBlockLayout: boolean
): LatexPreviewDiagnostic[] {
  const line = latexPreviewLineContext(text, range);
  const standaloneLine = line.before.trim() === "" && line.after.trim() === "";
  const layout = {
    kind: latexPreviewLayoutKind(renderDisplayMode, useBlockLayout),
    renderDisplayMode,
    useBlockLayout,
    standaloneLine
  };
  const base = {
    from: range.from,
    to: range.to,
    formula: range.formula,
    line,
    layout
  };
  const diagnostics: LatexPreviewDiagnostic[] = [];

  if (useBlockLayout && !renderDisplayMode) {
    diagnostics.push({
      ...base,
      code: "inline-math-with-block-layout",
      severity: "error",
      message: "Inline math is using a block CodeMirror decoration, which can corrupt editor measurement."
    });
  }

  if (range.displayMode && renderDisplayMode && useBlockLayout && !standaloneLine) {
    diagnostics.push({
      ...base,
      code: "display-math-block-on-non-standalone-line",
      severity: "error",
      message: "Display math on a non-standalone line must not use a CodeMirror block decoration."
    });
  }

  if (range.displayMode && renderDisplayMode && !useBlockLayout && !standaloneLine) {
    diagnostics.push({
      ...base,
      code: "display-math-inline-display-fallback",
      severity: "info",
      message: "Display math on a mixed line is rendered as a shrink-to-fit inline display widget."
    });
  }

  return diagnostics;
}
