"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_LIBRARY_ERAS } from "@/lib/library-display";
import { canUseAdminTools } from "@/lib/permissions";
import type { FormFeedbackState } from "@/lib/form-feedback";

const ERAS_PAGE = "/library/eras";
const MIN_YEAR = -5000;
class EraInputError extends Error {}

async function requireEraEditor() {
  const user = await requireAdmin();
  if (!canUseAdminTools(user)) throw new Error("You cannot edit the eras of the library.");
  return user;
}

function eraSlug(name: string) {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "epoque";
}

function text(formData: FormData, field: string, max: number) {
  return String(formData.get(field) ?? "").trim().slice(0, max);
}

/** Reads and checks an era form; the messages are shown on the era page. */
function readEra(formData: FormData) {
  const fr = formData.get("locale") !== "en";
  const nameFr = text(formData, "nameFr", 80);
  const nameEn = text(formData, "nameEn", 80) || nameFr;
  if (!nameFr) throw new EraInputError(fr ? "Donnez un nom à l’époque." : "Give the era a name.");
  const raw = String(formData.get("startYear") ?? "").trim();
  const startYear = Number(raw);
  const currentYear = new Date().getFullYear();
  if (!/^-?\d+$/.test(raw) || startYear === 0 || startYear < MIN_YEAR || startYear > currentYear) {
    throw new EraInputError(fr ? `L’année de début doit être un entier entre ${MIN_YEAR} et ${currentYear}, sans année zéro (utilisez -1 ou 1).` : `The start year must be a whole number between ${MIN_YEAR} and ${currentYear}, without year zero (use -1 or 1).`);
  }
  const color = String(formData.get("color") ?? "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new EraInputError(fr ? "Choisissez une couleur." : "Choose a colour.");
  return { nameFr, nameEn, startYear, color: color.toLowerCase(), descriptionFr: text(formData, "descriptionFr", 400), descriptionEn: text(formData, "descriptionEn", 400) };
}

async function uniqueEraSlug(name: string, id?: number) {
  const base = eraSlug(name);
  for (let suffix = 1; ; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const existing = await prisma.libraryEra.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === id) return slug;
  }
}

function done(message: string, kind: "saved" | "error"): never {
  revalidatePath("/library", "layout");
  redirect(`${ERAS_PAGE}?${kind}=${encodeURIComponent(message)}`);
}

export async function saveLibraryEraAction(id: number | null, _state: FormFeedbackState, formData: FormData): Promise<FormFeedbackState> {
  await requireEraEditor();
  const fr = formData.get("locale") !== "en";
  let message: string;
  try {
    const data = readEra(formData);
    const clash = await prisma.libraryEra.findUnique({ where: { startYear: data.startYear }, select: { id: true, nameFr: true, nameEn: true } });
    if (clash && clash.id !== id) throw new EraInputError(fr ? `L’époque « ${clash.nameFr} » commence déjà cette année-là.` : `The era “${clash.nameEn}” already starts that year.`);
    if (id) await prisma.libraryEra.update({ where: { id }, data });
    else await prisma.libraryEra.create({ data: { ...data, slug: await uniqueEraSlug(data.nameFr) } });
    message = fr ? `« ${data.nameFr} » est enregistrée.` : `“${data.nameEn}” was saved.`;
  } catch (error) {
    if (error instanceof EraInputError) return { error: error.message };
    return { error: fr
      ? "L’enregistrement n’a pas abouti. Vérifiez que l’année n’est pas déjà utilisée et réessayez ; votre saisie est conservée."
      : "The era could not be saved. Check that the year is not already used and try again; your input has been preserved." };
  }
  return done(message, "saved");
}

export async function deleteLibraryEraAction(id: number, formData: FormData) {
  await requireEraEditor();
  const fr = formData.get("locale") !== "en";
  if (await prisma.libraryEra.count() <= 1) return done(fr ? "La bibliothèque doit garder au moins une époque." : "The library must keep at least one era.", "error");
  const era = await prisma.libraryEra.delete({ where: { id } });
  return done(fr ? `« ${era.nameFr} » est supprimée : les fiches sont réparties selon leurs dates.` : `“${era.nameEn}” was removed: entries are assigned according to their dates.`, "saved");
}

/** Stores the default eras, so that they can be edited one by one. */
export async function createDefaultLibraryErasAction(formData: FormData) {
  await requireEraEditor();
  const fr = formData.get("locale") !== "en";
  if (await prisma.libraryEra.count() === 0) await prisma.libraryEra.createMany({ data: DEFAULT_LIBRARY_ERAS.map(era => ({ ...era, descriptionFr: era.descriptionFr ?? "", descriptionEn: era.descriptionEn ?? "" })) });
  return done(fr ? "Les époques par défaut sont enregistrées." : "The default eras were stored.", "saved");
}
