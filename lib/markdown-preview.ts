import { findMarkdownCodeRanges, overlapsRanges } from "./markdown-ranges.ts";

export function headingLevel(nodeName: string) {
  const match = nodeName.match(/^ATXHeading([1-6])$/);
  return match ? Number(match[1]) : null;
}

export function markdownPreviewClass(nodeName: string) {
  if (nodeName === "StrongEmphasis") return "cm-md-strong";
  if (nodeName === "Emphasis") return "cm-md-emphasis";
  if (nodeName === "InlineCode") return "cm-md-inline-code";
  if (nodeName === "Strikethrough") return "cm-md-strikethrough";
  if (nodeName === "Link") return "cm-md-link";
  return null;
}

export function markdownHeadingPreviewText(source: string) {
  const text = source.replace(/^#{1,6}\s*/, "");
  return text.trim() ? text : null;
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
