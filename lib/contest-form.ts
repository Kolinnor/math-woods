import { CONTENT_LIMITS } from "./content-limits.ts";
import { contestEndDateKey, isSaturdayDateKey } from "./problem-contests.ts";
import { normalizeTipImagePosition, normalizeTipImageUrl } from "./tip-images.ts";

export type ContestFormState = { error: string };

export class ContestFormError extends Error {}

export function parseContestForm(form: FormData, locale: "fr" | "en" = "en") {
  const fr = locale === "fr";
  const startDateKey = String(form.get("startDateKey") ?? "");
  if (!isSaturdayDateKey(startDateKey)) {
    throw new ContestFormError(fr ? "Choisissez une date de début correspondant à un samedi." : "Choose a starting date that falls on a Saturday.");
  }
  function text(name: string, label: string, max: number, required = false) {
    const value = String(form.get(name) ?? "").trim();
    if (required && !value) throw new ContestFormError(fr ? `${label} : ce champ est obligatoire.` : `${label} is required.`);
    if (value.length > max) throw new ContestFormError(fr ? `${label} : ${max} caractères maximum.` : `${label}: maximum ${max} characters.`);
    return value;
  }
  const titleEn = text("titleEn", fr ? "Titre anglais" : "English title", CONTENT_LIMITS.title, true);
  const titleFr = text("titleFr", fr ? "Titre français" : "French title", CONTENT_LIMITS.title, true);
  const reward = String(form.get("rewardPoints") ?? "").trim();
  const rewardPoints = Number(reward);
  if (!reward || !Number.isInteger(rewardPoints) || rewardPoints < 0 || rewardPoints > 10_000) {
    throw new ContestFormError(fr ? "Indiquez une récompense entière entre 0 et 10 000 points." : "Enter a whole-number prize between 0 and 10,000 points.");
  }
  let imageUrl;
  try {
    imageUrl = normalizeTipImageUrl(form.get("imageUrl"));
  } catch {
    throw new ContestFormError(fr ? "L’image doit utiliser une adresse HTTPS ou un chemin local, de 1 200 caractères maximum." : "The image must use an HTTPS URL or local path, up to 1,200 characters.");
  }
  return {
    startDateKey, endDateKey: contestEndDateKey(startDateKey), titleEn, titleFr, rewardPoints,
    bodyEn: text("bodyEn", fr ? "Description anglaise" : "English description", CONTENT_LIMITS.markdown),
    bodyFr: text("bodyFr", fr ? "Description française" : "French description", CONTENT_LIMITS.markdown),
    rulesEn: text("rulesEn", fr ? "Règles anglaises" : "English rules", CONTENT_LIMITS.longNote),
    rulesFr: text("rulesFr", fr ? "Règles françaises" : "French rules", CONTENT_LIMITS.longNote),
    criteriaEn: text("criteriaEn", fr ? "Critères anglais" : "English criteria", CONTENT_LIMITS.longNote),
    criteriaFr: text("criteriaFr", fr ? "Critères français" : "French criteria", CONTENT_LIMITS.longNote),
    imageUrl,
    imagePositionX: normalizeTipImagePosition(form.get("imagePositionX")),
    imagePositionY: normalizeTipImagePosition(form.get("imagePositionY"))
  };
}
