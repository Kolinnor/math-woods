import { LibraryReferenceRole } from "@prisma/client";

export type ProblemCitation = {
  citationKey: string;
  referenceId: number | null;
  text: string;
  url: string | null;
  locator: string | null;
  note: string | null;
  role: LibraryReferenceRole;
  isPrimary: boolean;
  spoiler: boolean;
};

export const MAX_PROBLEM_CITATIONS = 20;

export function citationUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 2000) throw new Error("Invalid reference URL.");
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid reference URL.");
  return url.href;
}

function textField(value: unknown, max: number, required = false): string | null {
  if (value === null || value === undefined) value = "";
  if (typeof value !== "string" || value.length > max) throw new Error("Reference text is too long or invalid.");
  const text = value.trim();
  if (required && !text) throw new Error("A reference needs a title or text.");
  return text || null;
}

export function parseProblemCitations(value: unknown): ProblemCitation[] {
  if (!Array.isArray(value) || value.length > MAX_PROBLEM_CITATIONS) throw new Error("Invalid references (maximum 20).");
  const keys = new Set<string>();
  const references = new Set<number>();
  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid reference.");
    const key = textField(raw.citationKey, 100, true)!;
    if (!/^[a-zA-Z0-9_-]+$/.test(key) || keys.has(key)) throw new Error("Invalid or duplicate citation key.");
    keys.add(key);
    const referenceId = raw.referenceId ?? null;
    if (referenceId !== null) {
      if (!Number.isSafeInteger(referenceId) || referenceId <= 0 || references.has(referenceId)) throw new Error("Invalid or duplicate reference.");
      references.add(referenceId);
    }
    if (!Object.values(LibraryReferenceRole).includes(raw.role)) throw new Error("Invalid reference role.");
    return {
      citationKey: key, referenceId,
      text: textField(raw.text, 2000, true)!,
      url: citationUrl(raw.url),
      locator: textField(raw.locator, 1000),
      note: textField(raw.note, 8000),
      role: raw.role, isPrimary: raw.isPrimary === true, spoiler: raw.spoiler === true
    };
  });
}

export function submittedProblemCitations(form: FormData): ProblemCitation[] | undefined {
  if (!form.has("problemCitations")) return undefined;
  const raw = form.get("problemCitations");
  if (typeof raw !== "string" || raw.length > 300000) throw new Error("Invalid references.");
  return parseProblemCitations(JSON.parse(raw));
}

export function citationText(citation: Pick<ProblemCitation, "text" | "locator">) {
  return [citation.text, citation.locator].filter(Boolean).join(" — ");
}

export function citationAdditionalDetails(citation: Pick<ProblemCitation, "locator" | "note" | "url">) {
  return [citation.locator, citation.note, citation.url].filter(Boolean).join("\n\n");
}

export function visibleProblemCitations(citations: ProblemCitation[], canReveal: boolean) {
  return citations.filter((citation) => canReveal || !citation.spoiler);
}

export function preserveHiddenCitations(current: ProblemCitation[], submitted: ProblemCitation[], canReveal: boolean) {
  if (canReveal) return submitted;
  const hidden = current.filter((item) => item.spoiler);
  if (submitted.some((item) => hidden.some((protectedItem) =>
    item.citationKey === protectedItem.citationKey || (item.referenceId !== null && item.referenceId === protectedItem.referenceId)))) {
    throw new Error("This reference cannot be modified before solving the problem.");
  }
  return [...submitted, ...hidden];
}

// Missing citations in a pre-citation snapshot mean unknown, never an empty list.
export function mergeProblemCitations(
  base: ProblemCitation[] | undefined, current: ProblemCitation[] | undefined, submitted: ProblemCitation[] | undefined
) {
  if (submitted === undefined) return { merged: current, conflict: false };
  if (base === undefined) return { merged: submitted, conflict: current !== undefined && JSON.stringify(current) !== JSON.stringify(submitted) };
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (same(base, submitted)) return { merged: current, conflict: false };
  return { merged: submitted, conflict: !same(base, current) && !same(current, submitted) };
}

export function translatedProblemCitations(base: ProblemCitation[], next: ProblemCitation[], translated: ProblemCitation[]) {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const shared = ["referenceId", "locator", "url", "role", "spoiler", "isPrimary"] as const;
  const result = translated.flatMap((citation) => {
    const original = base.find((item) => item.citationKey === citation.citationKey || (item.referenceId !== null && item.referenceId === citation.referenceId));
    if (!original || original.referenceId === null) return [citation];
    const updated = next.find((item) => item.citationKey === original.citationKey);
    if (!updated) return shared.every((field) => same(citation[field], original[field])) && citation.note === original.note && citation.text === original.text ? [] : [citation];
    const copy = { ...citation };
    for (const field of shared) {
      if (same(citation[field], original[field])) (copy as Record<string, unknown>)[field] = updated[field];
    }
    if (citation.text === original.text) copy.text = updated.text;
    if (citation.note === original.note) copy.note = updated.note;
    return [copy];
  });
  for (const citation of next) {
    if (citation.referenceId !== null && !base.some((item) => item.citationKey === citation.citationKey) && !result.some((item) => item.referenceId === citation.referenceId)) result.push(citation);
  }
  return result;
}
