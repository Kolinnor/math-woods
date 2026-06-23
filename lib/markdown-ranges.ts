export type TextRange = {
  from: number;
  to: number;
};

export function isEscaped(text: string, position: number) {
  let backslashes = 0;
  for (let index = position - 1; index >= 0 && text[index] === "\\"; index -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

export function overlapsRanges(from: number, to: number, ranges: TextRange[]) {
  return ranges.some((range) => from < range.to && to > range.from);
}

function containingRange(position: number, ranges: TextRange[]) {
  return ranges.find((range) => position >= range.from && position < range.to);
}

function findFenceRanges(text: string) {
  const ranges: TextRange[] = [];
  const openingPattern = /(^|\n)([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/g;

  for (const match of text.matchAll(openingPattern)) {
    const lineBreakPrefix = match[1] ?? "";
    const from = (match.index ?? 0) + lineBreakPrefix.length;
    if (overlapsRanges(from, from + match[0].length - lineBreakPrefix.length, ranges)) continue;

    const fence = match[3];
    const fenceChar = fence[0];
    const closingPattern = new RegExp(
      `(^|\\n)[ \\t]{0,3}\\${fenceChar}{${fence.length},}[ \\t]*(?=\\n|$)`,
      "g"
    );
    closingPattern.lastIndex = from + match[0].length - lineBreakPrefix.length;
    const closing = closingPattern.exec(text);
    const to = closing
      ? (closing.index ?? 0) + closing[0].length
      : text.length;

    ranges.push({ from, to });
  }

  return ranges;
}

function findInlineCodeRanges(text: string, fences: TextRange[]) {
  const ranges: TextRange[] = [];

  for (let position = 0; position < text.length; position += 1) {
    const fence = containingRange(position, fences);
    if (fence) {
      position = fence.to - 1;
      continue;
    }

    if (text[position] !== "`") continue;

    let tickCount = 1;
    while (text[position + tickCount] === "`") tickCount += 1;

    const delimiter = "`".repeat(tickCount);
    const closing = text.indexOf(delimiter, position + tickCount);
    const newline = text.indexOf("\n", position + tickCount);
    const fallbackTo = newline === -1 ? text.length : newline;
    const to = closing === -1 || (newline !== -1 && newline < closing)
      ? fallbackTo
      : closing + tickCount;

    ranges.push({ from: position, to });
    position = to - 1;
  }

  return ranges;
}

export function findMarkdownCodeRanges(text: string) {
  const fences = findFenceRanges(text);
  return [...fences, ...findInlineCodeRanges(text, fences)].sort((left, right) => left.from - right.from);
}
