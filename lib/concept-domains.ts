import type { Prisma } from "@prisma/client";
import { coarseDomainForCode, domainCodeAliases, parseDomainCode, parentProblemDomainForCode } from "./domains.ts";
import { MAX_PROBLEM_DOMAINS } from "./problem-domains.ts";

export const MAX_CONCEPT_DOMAINS = MAX_PROBLEM_DOMAINS;
export type ConceptDomains = { domainCode: string; domainCodes?: readonly string[] };

export class ConceptDomainsValidationError extends Error {
  constructor() { super("Choose between one and three concept domains."); }
}

export function parseConceptDomains(values: unknown): string[] {
  if (!Array.isArray(values) || values.length > 30 || values.some(v => typeof v !== "string" || v.length > 160)) throw new ConceptDomainsValidationError();
  const codes = [...new Set(values.map(value => parseDomainCode(value)))];
  if (!codes.length || codes.length > MAX_CONCEPT_DOMAINS) throw new ConceptDomainsValidationError();
  return codes;
}

/** Keep the existing primary code authoritative for legacy rows and snapshots. */
export function conceptDomainCodes(source: ConceptDomains): string[] {
  return [...new Set([source.domainCode, ...(source.domainCodes ?? [])].map(code => parseDomainCode(code)))];
}

export function conceptDomainData(codes: string[]) {
  const domainCodes = parseConceptDomains(codes);
  return { domainCodes, domainCode: domainCodes[0], domain: coarseDomainForCode(domainCodes[0]) };
}

export function submittedConceptDomains(form: FormData, existing?: ConceptDomains) {
  if (form.has("domains")) return parseConceptDomains(form.getAll("domains"));
  const previous = existing ? conceptDomainCodes(existing) : [];
  // An older form only edits the primary domain; it must not erase secondary ones.
  if (form.has("domain")) return parseConceptDomains([String(form.get("domain")), ...previous.slice(1)]);
  return previous.length ? previous : ["other"];
}

export function conceptDomainWhere(code: string): Prisma.ConceptWhereInput {
  const aliases = domainCodeAliases(code);
  return { OR: [
    { domainCode: { in: aliases } },
    { domainCodes: { hasSome: aliases } },
    ...(parentProblemDomainForCode(code)?.value === code ? [{ domain: coarseDomainForCode(code) }] : [])
  ] };
}
