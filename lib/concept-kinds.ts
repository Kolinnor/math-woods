import { ConceptKind } from "@prisma/client";

export const CONCEPT_KINDS = [
  ConceptKind.DEFINITION,
  ConceptKind.THEOREM,
  ConceptKind.INTUITIVE_NOTION,
  ConceptKind.NOTATION
] as const;

export function parseConceptKind(value: unknown, fallback: ConceptKind = ConceptKind.DEFINITION): ConceptKind {
  const normalized = String(value ?? "");
  return CONCEPT_KINDS.includes(normalized as ConceptKind) ? (normalized as ConceptKind) : fallback;
}
