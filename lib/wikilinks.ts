import { ensureSlug } from "./slug.ts";
import { findMarkdownCodeRanges, overlapsRanges } from "./markdown-ranges.ts";

export type WikiLink = {
  raw: string;
  target: string;
  targetSlug: string;
  label: string;
};

const wikiLinkPattern = /\[\[([^\]\n]+)\]\]/g;

export function cleanWikiLinkTarget(value: string) {
  return value.replace(/[\[\]\n\r|]+/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanWikiLinkLabel(value: string) {
  return value.replace(/[\[\]\n\r|]+/g, " ").replace(/\s+/g, " ").trim();
}

export function wikiLinkMarkup(target: string, label: string) {
  const cleanTarget = cleanWikiLinkTarget(target || label);
  const cleanLabel = cleanWikiLinkLabel(label || target);

  if (!cleanTarget) return cleanLabel;
  if (!cleanLabel) return `[[${cleanTarget}|${cleanTarget}]]`;
  return `[[${cleanTarget}|${cleanLabel}]]`;
}

function parseWikiLink(raw: string, inner: string): WikiLink | null {
  const [targetPart, labelPart] = inner.split("|", 2);
  const target = targetPart.trim();
  const label = (labelPart ?? target).trim();
  const targetSlug = ensureSlug(target, "concept");

  if (!target || !label || !targetSlug) return null;
  return { raw, target, targetSlug, label };
}

export function extractWikiLinks(markdown: string): WikiLink[] {
  const seen = new Set<string>();
  const links: WikiLink[] = [];
  const excluded = findMarkdownCodeRanges(markdown);

  for (const match of markdown.matchAll(wikiLinkPattern)) {
    const raw = match[0];
    const from = match.index ?? 0;
    const to = from + raw.length;
    if (overlapsRanges(from, to, excluded)) continue;

    const link = parseWikiLink(raw, match[1]);
    if (!link) continue;

    const key = `${link.targetSlug}\u0000${link.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(link);
  }

  return links;
}

export function replaceWikiLinks(
  markdown: string,
  resolveHref: (link: WikiLink) => string,
  missingSlugs: Set<string> = new Set()
): string {
  const excluded = findMarkdownCodeRanges(markdown);

  return markdown.replace(wikiLinkPattern, (raw: string, inner: string, offset: number) => {
    if (overlapsRanges(offset, offset + raw.length, excluded)) return raw;

    const link = parseWikiLink(raw, inner);
    if (!link) return raw;

    const href = resolveHref(link);
    const klass = missingSlugs.has(link.targetSlug) ? "wiki-link missing" : "wiki-link";

    return `<a class="${klass}" href="${href}">${escapeHtml(link.label)}</a>`;
  });
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
