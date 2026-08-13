import type { EditorState } from "@codemirror/state";

export type JsxGraphFoldRange = {
  from: number;
  to: number;
};

const JSXGRAPH_FENCE_START = /^ {0,3}(`{3,}|~{3,})[ \t]*jsxgraph[ \t]*$/i;

export function jsxGraphFoldRangeAtLine(state: EditorState, lineStart: number): JsxGraphFoldRange | null {
  const openingLine = state.doc.lineAt(lineStart);
  if (openingLine.from !== lineStart) return null;

  const openingMatch = JSXGRAPH_FENCE_START.exec(openingLine.text);
  if (!openingMatch) return null;

  const fence = openingMatch[1];
  const closingFence = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);

  for (let lineNumber = openingLine.number + 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (closingFence.test(line.text)) {
      return line.to > openingLine.to ? { from: openingLine.to, to: line.to } : null;
    }
  }

  return null;
}
