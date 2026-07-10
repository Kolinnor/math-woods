export const MARKDOWN_IMAGE_WIDTHS = [25, 50, 75, 100] as const;

export type MarkdownImageWidth = (typeof MARKDOWN_IMAGE_WIDTHS)[number];

const WIDTH_FRAGMENT_PREFIX = "mw-width-";

export function normalizeMarkdownImageWidth(value: unknown): MarkdownImageWidth {
  const parsed = Number(value);
  return MARKDOWN_IMAGE_WIDTHS.includes(parsed as MarkdownImageWidth) ? (parsed as MarkdownImageWidth) : 100;
}

export function markdownImageSrcWithWidth(src: string, width: MarkdownImageWidth) {
  const clean = markdownImageSizingFromSrc(src).src;
  const url = new URL(clean);
  url.hash = width === 100 ? "" : `${WIDTH_FRAGMENT_PREFIX}${width}`;
  return url.toString();
}

export function markdownImageSizingFromSrc(src: string): { src: string; width: MarkdownImageWidth } {
  let url: URL;

  try {
    url = new URL(src);
  } catch {
    return { src, width: 100 };
  }

  const hash = decodeURIComponent(url.hash.replace(/^#/, ""));
  const match = hash.match(/^mw-width-(25|50|75|100)$/);
  const width = match ? normalizeMarkdownImageWidth(match[1]) : 100;

  if (match) url.hash = "";

  return {
    src: url.toString(),
    width
  };
}
