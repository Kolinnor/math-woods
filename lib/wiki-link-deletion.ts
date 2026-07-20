import { findWikiLinkRanges } from "./markdown-preview.ts";

export type WikiLinkDeleteDirection = "backward" | "forward";

export type WikiLinkDeleteChange = {
  from: number;
  to: number;
  anchor: number;
};

export function wikiLinkDeleteChange(
  text: string,
  cursor: number,
  direction: WikiLinkDeleteDirection
): WikiLinkDeleteChange | null {
  const range = findWikiLinkRanges(text).find((item) =>
    direction === "backward" ? item.to === cursor : item.from === cursor
  );
  if (!range) return null;

  const from = direction === "backward" ? range.to - 1 : range.from;
  return {
    from,
    to: from + 1,
    anchor: from
  };
}
