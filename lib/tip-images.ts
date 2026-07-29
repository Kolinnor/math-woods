export const DEFAULT_TIP_IMAGE_URL = "/art/oak-grove.jpg";

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
