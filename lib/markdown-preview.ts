import { findMarkdownCodeRanges, overlapsRanges } from "./markdown-ranges.ts";

export function headingLevel(nodeName: string) {
  const match = nodeName.match(/^ATXHeading([1-6])$/);
  return match ? Number(match[1]) : null;
}

export function markdownPreviewClass(nodeName: string, raw?: string) {
  // Underscore-delimited emphasis (`_x_`, `__x__`) renders as underline, not
  // italic/bold, so the editor preview needs to match lib/markdown.ts.
  const isUnderscoreDelimited = raw?.startsWith("_") ?? false;
  if (nodeName === "StrongEmphasis") return isUnderscoreDelimited ? "cm-md-underline" : "cm-md-strong";
  if (nodeName === "Emphasis") return isUnderscoreDelimited ? "cm-md-underline" : "cm-md-emphasis";
  if (nodeName === "InlineCode") return "cm-md-inline-code";
  if (nodeName === "Strikethrough") return "cm-md-strikethrough";
  if (nodeName === "Link") return "cm-md-link";
  return null;
}

export function markdownMarkupShouldRemainVisible(nodeName: string) {
  return nodeName === "HeaderMark";
}

export type WikiLinkRange = {
  from: number;
  to: number;
  label: string;
};

export type ProblemLinkRange = {
  from: number;
  to: number;
};

export function findProblemLinkRanges(text: string): ProblemLinkRange[] {
  const ranges: ProblemLinkRange[] = [];
  const pattern = /\[([^\]\n]+)\]\(\/problems\/[^)\s]+\)/g;
  const excluded = findMarkdownCodeRanges(text);

  for (const match of text.matchAll(pattern)) {
    const matchFrom = match.index ?? 0;
    const matchTo = matchFrom + match[0].length;
    if (overlapsRanges(matchFrom, matchTo, excluded)) continue;

    const from = matchFrom + 1;
    ranges.push({ from, to: from + match[1].length });
  }

  return ranges;
}

export function findWikiLinkRanges(text: string): WikiLinkRange[] {
  const ranges: WikiLinkRange[] = [];
  const pattern = /\[\[([^\]\n]+)\]\]/g;
  const excluded = findMarkdownCodeRanges(text);

  for (const match of text.matchAll(pattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    if (overlapsRanges(from, to, excluded)) continue;

    const [target, alias] = match[1].split("|", 2);
    const label = (alias ?? target).trim();
    if (label) ranges.push({ from, to, label });
  }

  return ranges;
}
