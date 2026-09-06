import { parseProblemCitations, type ProblemCitation } from "./problem-citations.ts";

export function parseConceptCitations(value: unknown): ProblemCitation[] {
  return parseProblemCitations(value).map(citation => ({ ...citation, spoiler: false, isPrimary: false }));
}

export function submittedConceptCitations(form: FormData) {
  if (!form.has("conceptCitations")) return undefined;
  const raw = form.get("conceptCitations");
  if (typeof raw !== "string" || raw.length > 300000) throw new Error("Invalid references.");
  return parseConceptCitations(JSON.parse(raw));
}

export function legacyConceptCitations(references: Array<{ title: string; url: string | null; note: string | null }>): ProblemCitation[] {
  return references.map((reference, index) => ({ citationKey: `legacy-${index}`, referenceId: null, text: reference.title, url: reference.url, note: reference.note, locator: null, role: "FURTHER_READING", spoiler: false, isPrimary: false }));
}
