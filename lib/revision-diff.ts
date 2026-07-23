export type RevisionDiffPart = {
  value: string;
  changed?: boolean;
};

export type RevisionDiffRow = {
  kind: "context" | "removed" | "added";
  beforeLine?: number;
  afterLine?: number;
  parts: RevisionDiffPart[];
};

function tokenizeDiffLine(value: string) {
  return value.match(/\\[A-Za-z]+|\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
}

function lcsTable<T>(left: T[], right: T[], equals: (leftItem: T, rightItem: T) => boolean) {
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0) as number[]);

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex][rightIndex] = equals(left[leftIndex], right[rightIndex])
        ? table[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(table[leftIndex + 1][rightIndex], table[leftIndex][rightIndex + 1]);
    }
  }

  return table;
}

function diffTokens(before: string, after: string) {
  const beforeTokens = tokenizeDiffLine(before);
  const afterTokens = tokenizeDiffLine(after);
  const table = lcsTable(beforeTokens, afterTokens, (left, right) => left === right);
  const beforeParts: RevisionDiffPart[] = [];
  const afterParts: RevisionDiffPart[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeTokens.length || afterIndex < afterTokens.length) {
    if (
      beforeIndex < beforeTokens.length &&
      afterIndex < afterTokens.length &&
      beforeTokens[beforeIndex] === afterTokens[afterIndex]
    ) {
      beforeParts.push({ value: beforeTokens[beforeIndex] });
      afterParts.push({ value: afterTokens[afterIndex] });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    if (
      afterIndex >= afterTokens.length ||
      (beforeIndex < beforeTokens.length && table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1])
    ) {
      beforeParts.push({ value: beforeTokens[beforeIndex], changed: true });
      beforeIndex += 1;
      continue;
    }

    afterParts.push({ value: afterTokens[afterIndex], changed: true });
    afterIndex += 1;
  }

  return { beforeParts, afterParts };
}

function splitLines(markdown: string) {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

export function buildRevisionDiff(beforeMarkdown: string, afterMarkdown: string) {
  const beforeLines = splitLines(beforeMarkdown);
  const afterLines = splitLines(afterMarkdown);
  const table = lcsTable(beforeLines, afterLines, (left, right) => left === right);
  const rows: RevisionDiffRow[] = [];
  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeLines.length || afterIndex < afterLines.length) {
    if (
      beforeIndex < beforeLines.length &&
      afterIndex < afterLines.length &&
      beforeLines[beforeIndex] === afterLines[afterIndex]
    ) {
      rows.push({
        kind: "context",
        beforeLine: beforeIndex + 1,
        afterLine: afterIndex + 1,
        parts: [{ value: beforeLines[beforeIndex] || " " }]
      });
      beforeIndex += 1;
      afterIndex += 1;
      continue;
    }

    const removed: Array<{ line: number; value: string }> = [];
    const added: Array<{ line: number; value: string }> = [];

    while (
      beforeIndex < beforeLines.length &&
      (afterIndex >= afterLines.length || table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) &&
      !(afterIndex < afterLines.length && beforeLines[beforeIndex] === afterLines[afterIndex])
    ) {
      removed.push({ line: beforeIndex + 1, value: beforeLines[beforeIndex] });
      beforeIndex += 1;
    }

    while (
      afterIndex < afterLines.length &&
      (beforeIndex >= beforeLines.length || table[beforeIndex][afterIndex + 1] > table[beforeIndex + 1][afterIndex]) &&
      !(beforeIndex < beforeLines.length && beforeLines[beforeIndex] === afterLines[afterIndex])
    ) {
      added.push({ line: afterIndex + 1, value: afterLines[afterIndex] });
      afterIndex += 1;
    }

    const pairedCount = Math.min(removed.length, added.length);
    for (let index = 0; index < pairedCount; index += 1) {
      const { beforeParts, afterParts } = diffTokens(removed[index].value, added[index].value);
      rows.push({ kind: "removed", beforeLine: removed[index].line, parts: beforeParts });
      rows.push({ kind: "added", afterLine: added[index].line, parts: afterParts });
    }
    for (const item of removed.slice(pairedCount)) {
      rows.push({ kind: "removed", beforeLine: item.line, parts: [{ value: item.value || " ", changed: true }] });
    }
    for (const item of added.slice(pairedCount)) {
      rows.push({ kind: "added", afterLine: item.line, parts: [{ value: item.value || " ", changed: true }] });
    }
  }

  return rows;
}
