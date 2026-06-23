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

export type WikiLinkRange = {
  from: number;
  to: number;
  label: string;
};

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
