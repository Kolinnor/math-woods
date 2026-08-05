export const DEFAULT_TIP_IMAGE_URL = "/art/oak-grove.jpg";
export const DEFAULT_TIP_IMAGE_POSITION = 50;
export const MAX_TIP_IMAGES = 12;

export type TipImageValue = {
  imageUrl: string;
  imagePositionX: number;
  imagePositionY: number;
};

export function normalizeTipImageUrl(value: unknown) {
  const imageUrl = String(value ?? "").trim();
  if (!imageUrl) return null;
  if (imageUrl.length > 1200) throw new Error("Tip image URL must be at most 1,200 characters.");

  if (imageUrl.startsWith("/") && !imageUrl.startsWith("//")) return imageUrl;

  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol === "https:") return parsed.toString();
  } catch {
    // Use the focused validation message below.
  }

  throw new Error("Tip image URL must use HTTPS or a local site path.");
}

export function tipImageUrl(imageUrl: string | null | undefined) {
  return imageUrl?.trim() || DEFAULT_TIP_IMAGE_URL;
}

export function normalizeTipImagePosition(value: unknown) {
  if (value === null || value === undefined || value === "") return DEFAULT_TIP_IMAGE_POSITION;
  const position = Number(value);
  if (!Number.isFinite(position)) return DEFAULT_TIP_IMAGE_POSITION;
  return Math.max(0, Math.min(100, Math.round(position)));
}

export function tipImageObjectPosition(positionX: unknown, positionY: unknown) {
  return `${normalizeTipImagePosition(positionX)}% ${normalizeTipImagePosition(positionY)}%`;
}

export function tipImageDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function dailyTipImage<T extends TipImageValue>(
  images: readonly T[],
  tipId: number,
  date = new Date()
) {
  if (images.length === 0) return null;
  const index = stableHash(`${tipId}:${tipImageDateKey(date)}`) % images.length;
  return images[index] ?? null;
}
