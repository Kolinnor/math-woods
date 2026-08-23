import sharp from "sharp";

const CONTENT_IMAGE_MAX_DIMENSION = 2560;
const CONTENT_IMAGE_MAX_PIXELS = 25_000_000;

type ContentImageFormat = "avif" | "jpeg" | "png" | "webp";

const CONTENT_TYPES: Record<ContentImageFormat, string> = {
  avif: "image/avif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

const FORMAT_BY_CONTENT_TYPE: Record<string, ContentImageFormat> = {
  "image/avif": "avif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp"
};

export type ProcessedContentImage = {
  body: Buffer;
  contentType: string;
  width: number;
  height: number;
};

type ProcessContentImageOptions = {
  maxDimension?: number;
};

export async function processContentImage(
  image: File,
  options: ProcessContentImageOptions = {}
): Promise<ProcessedContentImage> {
  const maxDimension = options.maxDimension ?? CONTENT_IMAGE_MAX_DIMENSION;
  const source = Buffer.from(await image.arrayBuffer());
  const input = sharp(source, { animated: false, limitInputPixels: CONTENT_IMAGE_MAX_PIXELS });
  const metadata = await input.metadata();
  const format = FORMAT_BY_CONTENT_TYPE[image.type];
  const detectedFormatMatches = format === "avif"
    ? metadata.format === "heif"
    : metadata.format === format;

  if (!format || !detectedFormatMatches) {
    throw new Error("Only AVIF, JPEG, PNG, and WebP images are supported.");
  }

  const canKeepSource = Boolean(
    metadata.width
    && metadata.height
    && metadata.width <= maxDimension
    && metadata.height <= maxDimension
    && (!metadata.orientation || metadata.orientation === 1)
  );
  if (canKeepSource) {
    return {
      body: source,
      contentType: CONTENT_TYPES[format],
      width: metadata.width!,
      height: metadata.height!
    };
  }

  let pipeline = sharp(source, { animated: false, limitInputPixels: CONTENT_IMAGE_MAX_PIXELS })
    .rotate()
    .resize(maxDimension, maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false
    });

  if (format === "jpeg") pipeline = pipeline.jpeg({ quality: 92, mozjpeg: true });
  if (format === "png") pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  if (format === "webp") pipeline = pipeline.webp({ quality: 90, effort: 4 });
  if (format === "avif") pipeline = pipeline.avif({ quality: 75, effort: 4 });

  const processed = await pipeline.toBuffer({ resolveWithObject: true });
  if (!processed.info.width || !processed.info.height) {
    throw new Error("The server could not read this image's dimensions.");
  }

  return {
    body: processed.data,
    contentType: CONTENT_TYPES[format],
    width: processed.info.width,
    height: processed.info.height
  };
}
