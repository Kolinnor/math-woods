export type MarkdownImageWidth = number;

const WIDTH_FRAGMENT_PREFIX = "mw-width-";
const BORDER_FRAGMENT = "mw-border";
const MIN_IMAGE_WIDTH = 5;
const MAX_IMAGE_WIDTH = 100;

export function normalizeMarkdownImageWidth(value: unknown): MarkdownImageWidth {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(MAX_IMAGE_WIDTH, Math.max(MIN_IMAGE_WIDTH, Math.round(parsed)));
}

export function markdownImageSrcWithWidth(src: string, width: MarkdownImageWidth, bordered = false) {
  const clean = markdownImageSizingFromSrc(src).src;
  const url = new URL(clean);
  const normalizedWidth = normalizeMarkdownImageWidth(width);
  const fragments = [
    normalizedWidth === 100 ? null : `${WIDTH_FRAGMENT_PREFIX}${normalizedWidth}`,
    bordered ? BORDER_FRAGMENT : null
  ].filter(Boolean);
  url.hash = fragments.join("&");
  return url.toString();
}

export function markdownImageSizingFromSrc(src: string): {
  src: string;
  width: MarkdownImageWidth;
  bordered: boolean;
} {
  let url: URL;

  try {
    url = new URL(src);
  } catch {
    return { src, width: 100, bordered: false };
  }

  const hash = decodeURIComponent(url.hash.replace(/^#/, ""));
  const fragments = hash.split("&").filter(Boolean);
  const widthFragment = fragments.find((fragment) => fragment.startsWith(WIDTH_FRAGMENT_PREFIX));
  const widthMatch = widthFragment?.match(/^mw-width-(\d{1,3}(?:\.\d+)?)$/) ?? null;
  const isImageMetadata = fragments.length > 0 && fragments.every(
    (fragment) => fragment === BORDER_FRAGMENT || /^mw-width-\d{1,3}(?:\.\d+)?$/.test(fragment)
  );
  const width = isImageMetadata && widthMatch ? normalizeMarkdownImageWidth(widthMatch[1]) : 100;
  const bordered = isImageMetadata && fragments.includes(BORDER_FRAGMENT);

  if (isImageMetadata) url.hash = "";

  return {
    src: url.toString(),
    width,
    bordered
  };
}
