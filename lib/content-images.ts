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

export async function processContentImage(image: File): Promise<ProcessedContentImage> {
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

  let pipeline = sharp(source, { animated: false, limitInputPixels: CONTENT_IMAGE_MAX_PIXELS })
    .rotate()
    .resize(CONTENT_IMAGE_MAX_DIMENSION, CONTENT_IMAGE_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true
    });

  if (format === "jpeg") pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
  if (format === "png") pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
  if (format === "webp") pipeline = pipeline.webp({ quality: 82, effort: 4 });
  if (format === "avif") pipeline = pipeline.avif({ quality: 60, effort: 4 });

  const processed = await pipeline.toBuffer({ resolveWithObject: true });
  if (!processed.info.width || !processed.info.height) {
    throw new Error("The server could not read this image's dimensions.");
  }

  const canKeepSource = Boolean(
    metadata.width
    && metadata.height
    && metadata.width <= CONTENT_IMAGE_MAX_DIMENSION
    && metadata.height <= CONTENT_IMAGE_MAX_DIMENSION
    && (!metadata.orientation || metadata.orientation === 1)
    && source.byteLength <= processed.data.byteLength
  );

  return {
    body: canKeepSource ? source : processed.data,
    contentType: CONTENT_TYPES[format],
    width: canKeepSource ? metadata.width! : processed.info.width,
    height: canKeepSource ? metadata.height! : processed.info.height
  };
}
