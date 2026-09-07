export type PortraitCrop = { x: number; y: number; zoom: number };
export const DEFAULT_PORTRAIT_CROP: PortraitCrop = { x: 50, y: 50, zoom: 1 };

export function parsePortraitCrop(value: unknown): PortraitCrop {
  if (!value || typeof value !== "object") throw new Error("Invalid portrait framing.");
  const { x, y, zoom } = value as PortraitCrop;
  if (![x, y, zoom].every(n => typeof n === "number" && Number.isFinite(n)) || x < 0 || x > 100 || y < 0 || y > 100 || zoom < 1 || zoom > 3) throw new Error("Invalid portrait framing.");
  return { x, y, zoom };
}

export function portraitCrop(value: unknown): PortraitCrop {
  try { return parsePortraitCrop(value); } catch { return DEFAULT_PORTRAIT_CROP; }
}

export function submittedPortraitCrop(form: FormData) {
  if (!form.has("portraitCrop")) return undefined; // Older forms preserve the saved framing.
  const value = form.get("portraitCrop");
  if (typeof value !== "string" || value.length > 200) throw new Error("Invalid portrait framing.");
  return parsePortraitCrop(JSON.parse(value));
}

export function portraitImageStyle(value: unknown) {
  const { x, y, zoom } = portraitCrop(value);
  return { position: "absolute" as const, width: `${zoom * 100}%`, height: `${zoom * 100}%`, maxWidth: "none", objectFit: "cover" as const, objectPosition: `${x}% ${y}%`, left: `${(1 - zoom) * x}%`, top: `${(1 - zoom) * y}%` };
}

export function portraitDetails(values: { portraitDetails?: string | null; imageCredit?: string | null; imageCreditUrl?: string | null; imageLicense?: string | null }) {
  return values.portraitDetails ?? [...new Set([values.imageCredit, values.imageCreditUrl, values.imageLicense].filter(Boolean))].join("\n");
}
