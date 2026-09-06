import type { Prisma } from "@prisma/client";
import { optionalBoundedText } from "./content-limits.ts";
import { inspectBibtex, MAX_BIBTEX_LENGTH, validCitationKey } from "./reference-bibtex.ts";

export function readReferenceBibliography(form: FormData) {
  const locale = form.get("language") === "fr" ? "fr" : "en";
  const fields = Object.fromEntries((["edition", "volume", "translator", "editors", "journal", "issue", "pages"] as const).map(name => [name, optionalBoundedText(form.get(name), 1200, name)])) as Record<"edition" | "volume" | "translator" | "editors" | "journal" | "issue" | "pages", string | null>;
  const bibtex = optionalBoundedText(form.get("bibtex"), MAX_BIBTEX_LENGTH, "BibTeX");
  const report = inspectBibtex(bibtex ?? "", locale);
  let citationKey = optionalBoundedText(form.get("citationKey"), 240, "Citation key");
  if (report.errors.length) throw new Error(report.errors.join(" "));
  if (citationKey && !validCitationKey(citationKey)) throw new Error(locale === "fr" ? "La clé de citation doit utiliser des lettres sans accent, des chiffres, des tirets ou des points." : "The citation key must use unaccented letters, numbers, hyphens or dots.");
  citationKey ||= report.key;
  return { ...fields, bibtex, citationKey, bibliographyVersion: 1 };
}

// Hold this lock until the write commits: two simultaneous links must not create a cycle.
export async function validateReferenceWork(tx: Prisma.TransactionClient, form: FormData, referenceType: string, id?: number) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('library-reference-works'))::text`;
  const current = id ? await tx.libraryReference.findUnique({ where: { id }, select: { workId: true } }) : null;
  const raw = String(form.get("workId") ?? "").trim();
  const workId = !form.has("workId") ? current?.workId ?? null : raw ? Number(raw) : null;
  const fr = form.get("language") === "fr";
  const error = () => new Error(fr ? "Choisissez une œuvre générale publiée, de type livre. Une édition ne peut pas contenir d’autres éditions." : "Choose a published general work of type book. An edition cannot contain other editions.");
  if (workId !== null && (!Number.isSafeInteger(workId) || workId < 1 || workId === id)) throw error();
  const children = id ? await tx.libraryReference.count({ where: { workId: id } }) : 0;
  if (children && (workId || referenceType !== "BOOK")) throw error();
  if (workId) {
    const work = await tx.libraryReference.findUnique({ where: { id: workId } });
    if (!work || work.workId || work.referenceType !== "BOOK" || referenceType !== "BOOK" || work.mergedIntoId || (workId !== current?.workId && (work.status !== "PUBLISHED" || !work.searchable))) throw error();
  }
  return workId;
}
