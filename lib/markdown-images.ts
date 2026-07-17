export type MarkdownImageWidth = number;

const WIDTH_FRAGMENT_PREFIX = "mw-width-";
const MIN_IMAGE_WIDTH = 5;
const MAX_IMAGE_WIDTH = 100;

export function normalizeMarkdownImageWidth(value: unknown): MarkdownImageWidth {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(parsed)));
}

export function markdownImageSrcWithWidth(src: string, width: MarkdownImageWidth) {
  const clean = markdownImageSizingFromSrc(src).src;
  const url = new URL(clean);
  const normalizedWidth = normalizeMarkdownImageWidth(width);
  url.hash = normalizedWidth === 100 ? "" : `${WIDTH_FRAGMENT_PREFIX}${normalizedWidth}`;
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
  const match = hash.match(/^mw-width-(\d{1,3}(?:\.\d+)?)$/);
  const width = match ? normalizeMarkdownImageWidth(match[1]) : 100;

  if (match) url.hash = "";

  return {
    src: url.toString(),
    width
  };
}
