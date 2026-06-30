import { findLatexRanges } from "./latex-ranges.ts";

export type DisplayMathLineBreakResult = {
  text: string;
  cursor: number | null;
  changed: boolean;
};

function mapPositionThroughLineReplacement(
  position: number,
  lineStart: number,
  lineEnd: number,
  mathFrom: number,
  mathTo: number,
  replacement: string,
  mathOffset: number,
  afterOffset: number | null,
  suffixTrimmedLength: number
) {
  if (position <= lineStart) return position;
  if (position >= lineEnd) return position + replacement.length - (lineEnd - lineStart);

  if (position <= mathFrom) {
    return lineStart + Math.min(position - lineStart, mathOffset);
  }

  if (position <= mathTo) {
    return lineStart + mathOffset + position - mathFrom;
  }

  if (afterOffset === null) {
    return lineStart + replacement.length;
  }

  return lineStart + afterOffset + Math.min(Math.max(0, position - mathTo - suffixTrimmedLength), replacement.length - afterOffset);
}

export function normalizeDisplayMathLineBreaks(text: string, cursor: number | null = null): DisplayMathLineBreakResult {
  let output = text;
  let mappedCursor = cursor;
  const ranges = findLatexRanges(text);

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    if (!range.displayMode) continue;

    const lineStart = output.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
    const nextBreak = output.indexOf("\n", range.to);
    const lineEnd = nextBreak === -1 ? output.length : nextBreak;
    const before = output.slice(lineStart, range.from);
    const math = output.slice(range.from, range.to);
    const after = output.slice(range.to, lineEnd);

    const parts: string[] = [];
    const beforeTrimmed = before.trimEnd();
    const afterTrimmed = after.trimStart();
    const suffixTrimmedLength = after.length - afterTrimmed.length;
    const isStandaloneLine = before.trim() === "" && after.trim() === "";

    if (isStandaloneLine) {
      const needsBlankBefore = lineStart > 1 && output[lineStart - 2] !== "\n";
      const needsBlankAfter = lineEnd + 1 < output.length && output[lineEnd + 1] !== "\n";

      if (!needsBlankBefore && !needsBlankAfter) continue;

      const replacement = `${needsBlankBefore ? "\n" : ""}${math}${needsBlankAfter ? "\n" : ""}`;
      const mathOffset = needsBlankBefore ? 1 : 0;

      if (mappedCursor !== null) {
        mappedCursor = mapPositionThroughLineReplacement(
          mappedCursor,
          lineStart,
          lineEnd,
          range.from,
          range.to,
          replacement,
          mathOffset,
          null,
          0
        );
      }

      output = `${output.slice(0, lineStart)}${replacement}${output.slice(lineEnd)}`;
      continue;
    }

    if (beforeTrimmed) parts.push(beforeTrimmed);
    const mathOffset = parts.join("\n\n").length + (parts.length ? 2 : 0);
    parts.push(math);
    const afterOffset = afterTrimmed ? parts.join("\n\n").length + 2 : null;
    if (afterTrimmed) parts.push(afterTrimmed);

    const replacement = parts.join("\n\n");

    if (mappedCursor !== null) {
      mappedCursor = mapPositionThroughLineReplacement(
        mappedCursor,
        lineStart,
        lineEnd,
        range.from,
        range.to,
        replacement,
        mathOffset,
        afterOffset,
        suffixTrimmedLength
      );
    }

    output = `${output.slice(0, lineStart)}${replacement}${output.slice(lineEnd)}`;
  }

  return {
    text: output,
    cursor: mappedCursor,
    changed: output !== text
  };
}
