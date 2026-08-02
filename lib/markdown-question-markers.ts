import { findMarkdownCodeRanges, overlapsRanges } from "./markdown-ranges.ts";

export type MarkdownQuestionMarker = {
  primaryFrom: number;
  primaryTo: number;
  secondaryFrom: number | null;
  secondaryTo: number | null;
  compact: boolean;
};

const QUESTION_MARKER_PATTERN = /^([ \t]*)(\d+\))(?:([ \t]*)([a-z]\))(?=[ \t]+|$)|(?=[ \t]+|$))/gim;

export function findMarkdownQuestionMarkers(markdown: string): MarkdownQuestionMarker[] {
  const codeRanges = findMarkdownCodeRanges(markdown);
  const markers: MarkdownQuestionMarker[] = [];

  for (const match of markdown.matchAll(QUESTION_MARKER_PATTERN)) {
    const matchFrom = match.index ?? 0;
    const primaryFrom = matchFrom + match[1].length;
    const primaryTo = primaryFrom + match[2].length;
    const secondary = match[4] ?? null;
    const spacing = match[3] ?? "";
    const secondaryFrom = secondary ? primaryTo + spacing.length : null;
    const secondaryTo = secondaryFrom === null ? null : secondaryFrom + secondary.length;
    const markerTo = secondaryTo ?? primaryTo;

    if (overlapsRanges(primaryFrom, markerTo, codeRanges)) continue;

    markers.push({
      primaryFrom,
      primaryTo,
      secondaryFrom,
      secondaryTo,
      compact: Boolean(secondary) && spacing.length === 0
    });
  }

  return markers;
}

export function normalizeMarkdownQuestionMarkers(markdown: string) {
  let normalized = markdown;
  const markers = findMarkdownQuestionMarkers(markdown);

  for (let index = markers.length - 1; index >= 0; index -= 1) {
    const marker = markers[index];
    if (marker.secondaryFrom === null || marker.secondaryTo === null) continue;

    const secondary = markdown.slice(marker.secondaryFrom, marker.secondaryTo);
    normalized = `${normalized.slice(0, marker.secondaryFrom)}${marker.compact ? " " : ""}**${secondary}**${normalized.slice(marker.secondaryTo)}`;
  }

  return normalized;
}
