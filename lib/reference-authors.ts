import { CONTENT_LIMITS, boundedText, optionalBoundedText } from "./content-limits.ts";

export type ReferenceAuthorInput = { name: string; mathematicianId: number | null };

// Bibliographic spelling is independent of the linked person's current display name.
export function referenceAuthorText(rows: ReferenceAuthorInput[]) {
  return rows.map(row => row.name.trim()).filter(Boolean).join("\n");
}

function nameKey(name: string) {
  const parts = name.trim().split(",").map(part => part.trim());
  return (parts.length === 2 && parts.every(Boolean) ? `${parts[1]} ${parts[0]}` : name).normalize("NFC").trim().replace(/\s+/g, " ");
}

// BibTeX can invert "Henri Poincaré" into "Poincaré, Henri". Retain existing
// unambiguous links through that formatting change, never infer new identities.
export function referenceAuthorsFromText(text: string | null | undefined, previous: ReferenceAuthorInput[] = []): ReferenceAuthorInput[] {
  const names = (text ?? "").split(/\r?\n/).map(name => name.trim()).filter(Boolean);
  return names.map(name => {
    const matches = previous.filter(row => nameKey(row.name) === nameKey(name));
    return { name, mathematicianId: matches.length === 1 && names.filter(value => nameKey(value) === nameKey(name)).length === 1 ? matches[0].mathematicianId : null };
  });
}

export function submittedReferenceAuthors(form: FormData) {
  if (!form.has("authorEntries")) {
    const authors = optionalBoundedText(form.get("authors"), CONTENT_LIMITS.mediumText, "Authors");
    return { authors, entries: referenceAuthorsFromText(authors) };
  }
  const fr = form.get("language") === "fr";
  const invalid = () => new Error(fr ? "La liste des auteurs est invalide. Choisissez une fiche ou saisissez un nom." : "Invalid author list. Choose a record or enter a name.");
  let value: unknown;
  try { value = JSON.parse(boundedText(form.get("authorEntries"), 20000, "Authors")); } catch { throw invalid(); }
  if (!Array.isArray(value) || value.length > 100) throw invalid();
  const seen = new Set<number>();
  const entries: ReferenceAuthorInput[] = value.map(row => {
    if (!row || typeof row !== "object" || typeof row.name !== "string") throw invalid();
    const name = row.name.trim();
    const mathematicianId = row.mathematicianId;
    if (!name || /[\r\n]/.test(name) || name.length > CONTENT_LIMITS.mediumText) throw invalid();
    if (mathematicianId !== null && (!Number.isSafeInteger(mathematicianId) || mathematicianId < 1 || seen.has(mathematicianId))) throw invalid();
    if (mathematicianId !== null) seen.add(mathematicianId);
    return { name, mathematicianId };
  });
  const authors = optionalBoundedText(referenceAuthorText(entries), CONTENT_LIMITS.mediumText, "Authors");
  return { authors, entries };
}
