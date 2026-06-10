import { findMarkdownCodeRanges, isEscaped, overlapsRanges } from "./markdown-ranges.ts";

export type LatexRange = {
  from: number;
  to: number;
  formula: string;
  displayMode: boolean;
};

function isInlineDollarOpen(text: string, position: number) {
  const next = text[position + 1];
  return Boolean(next && !/\s/.test(next));
}

function isInlineDollarClose(text: string, position: number) {
  const previous = text[position - 1];
  const next = text[position + 1];

  if (!previous || /\s/.test(previous)) return false;
  return !next || !/[A-Za-z0-9]/.test(next);
}

type Delimiter = {
  close: string;
  formulaFrom: number;
  displayMode: boolean;
  singleLine: boolean;
};

function delimiterAt(text: string, position: number): Delimiter | null {
  if (text.startsWith("\\(", position) && !isEscaped(text, position)) {
    return { close: "\\)", formulaFrom: position + 2, displayMode: false, singleLine: true };
  }

  if (text.startsWith("\\[", position) && !isEscaped(text, position)) {
    return { close: "\\]", formulaFrom: position + 2, displayMode: true, singleLine: false };
  }

  if (text.startsWith("$$", position) && !isEscaped(text, position)) {
    return { close: "$$", formulaFrom: position + 2, displayMode: true, singleLine: false };
  }

  if (text[position] === "$" && !isEscaped(text, position) && isInlineDollarOpen(text, position)) {
    return { close: "$", formulaFrom: position + 1, displayMode: false, singleLine: true };
  }

  return null;
}

function findClosingDelimiter(text: string, delimiter: Delimiter) {
  let closing = delimiter.formulaFrom;

  while (closing < text.length) {
    if (delimiter.singleLine && text[closing] === "\n") return -1;

    if (text.startsWith(delimiter.close, closing) && !isEscaped(text, closing)) {
      if (delimiter.close !== "$" || isInlineDollarClose(text, closing)) return closing;
    }

    closing += 1;
  }

  return -1;
}

export function findLatexRanges(text: string): LatexRange[] {
  const ranges: LatexRange[] = [];
  const excluded = findMarkdownCodeRanges(text);

  for (let position = 0; position < text.length; position += 1) {
    if (overlapsRanges(position, position + 1, excluded)) continue;

    const delimiter = delimiterAt(text, position);
    if (!delimiter) continue;

    const closing = findClosingDelimiter(text, delimiter);
    if (closing === -1) continue;

    const to = closing + delimiter.close.length;
    const formula = text.slice(delimiter.formulaFrom, closing).trim();

    if (formula && !overlapsRanges(position, to, excluded)) {
      ranges.push({ from: position, to, formula, displayMode: delimiter.displayMode });
    }

    position = to - 1;
  }

  return ranges;
}
