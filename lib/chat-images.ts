import sharp from "sharp";
import {
  CHAT_IMAGE_MAX_DIMENSION,
  CHAT_IMAGE_MAX_INPUT_BYTES,
  CHAT_IMAGE_MAX_OUTPUT_BYTES
} from "@/lib/chat-image-config";
import {
  buildChatImageObjectKey,
  createPresignedImageDelete,
  createPresignedImageUpload,
  getChatImageStorageConfig,
  PRIVATE_IMAGE_CACHE_CONTROL,
  type ImageStorageConfig
} from "@/lib/image-storage";

const CHAT_IMAGE_ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export { CHAT_IMAGE_ROLLING_WINDOW_MS } from "@/lib/chat-image-config";

export type StoredChatImage = {
  key: string;
  width: number;
  height: number;
  bytes: number;
};

export async function storeChatImage(userId: number, image: File): Promise<StoredChatImage> {
  if (image.size <= 0 || image.size > CHAT_IMAGE_MAX_INPUT_BYTES) {
    throw new Error("Choose a JPEG, PNG, or WebP image smaller than 5 MB.");
  }

  const source = Buffer.from(await image.arrayBuffer());
  const input = sharp(source, { animated: false, limitInputPixels: 25_000_000 });
  const metadata = await input.metadata();
  if (!metadata.format || !CHAT_IMAGE_ALLOWED_FORMATS.has(metadata.format)) {
    throw new Error("Only JPEG, PNG, and WebP images are supported.");
  }

  let processed = await sharp(source, { animated: false, limitInputPixels: 25_000_000 })
    .rotate()
    .resize(CHAT_IMAGE_MAX_DIMENSION, CHAT_IMAGE_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  if (processed.data.byteLength > CHAT_IMAGE_MAX_OUTPUT_BYTES) {
    processed = await sharp(source, { animated: false, limitInputPixels: 25_000_000 })
      .rotate()
      .resize(1_600, 1_600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 70, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  }
  if (
    processed.data.byteLength > CHAT_IMAGE_MAX_OUTPUT_BYTES
    || !processed.info.width
    || !processed.info.height
  ) {
    throw new Error("This image is too complex to compress safely. Try a smaller image.");
  }

  const config = getChatImageStorageConfig();
  if (!config) throw new Error("Private chat image storage is not configured.");
  const key = buildChatImageObjectKey({ userId });
  const upload = createPresignedImageUpload(
    config,
    key,
    "image/webp",
    new Date(),
    PRIVATE_IMAGE_CACHE_CONTROL
  );
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: Uint8Array.from(processed.data).buffer
  });
  if (!response.ok) throw new Error("Image storage rejected the upload.");

  return {
    key,
    width: processed.info.width,
    height: processed.info.height,
    bytes: processed.data.byteLength
  };
}

export async function deleteStoredChatImage(config: ImageStorageConfig, key: string) {
  const deletion = createPresignedImageDelete(config, key);
  const response = await fetch(deletion.url, { method: deletion.method });
  return response.ok || response.status === 404;
}
