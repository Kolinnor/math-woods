import type { Prisma } from "@prisma/client";
import { parse } from "@retorquere/bibtex-parser";
import type { ProblemCitation } from "./problem-citations.ts";
import { exportReferenceBibtex, generatedBibtex, upgradeLegacyBibliography, type BibliographicReference } from "./reference-bibtex.ts";

type Page = { type: "problem" | "concept"; slug: string; title: string; language: string };
export function publicBibliographyRecord(reference: BibliographicReference) {
  const r = upgradeLegacyBibliography(reference);
  return { slug: r.slug, type: r.referenceType, title: r.canonicalTitle, authors: r.authors ?? null, editors: r.editors ?? null,
    publisher: r.publisher ?? null, year: r.year ?? null, yearLabel: r.yearLabel ?? null, edition: r.edition ?? null,
    volume: r.volume ?? null, translator: r.translator ?? null, journal: r.journal ?? null, issue: r.issue ?? null,
    pages: r.pages ?? null, url: r.url ?? null, doi: r.doi ?? null, isbn: r.isbn ?? null, citationKey: r.citationKey || `mw-${r.id ?? r.slug}`,
    bibtex: generatedBibtex(r) };
}

// The caller must check page access and filter spoilers BEFORE invoking this helper.
export async function pageBibliographyResponse(db: Prisma.TransactionClient, page: Page, citations: ProblemCitation[], format: "json" | "bibtex", excludedReferenceIds: number[] = []) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  const records = await db.libraryReference.findMany({ where: { id: { in: citations.flatMap(c => c.referenceId === null ? [] : [c.referenceId]) }, status: "PUBLISHED", searchable: true, mergedIntoId: null } });
  const entries = citations.map(citation => {
    const record = records.find(r => r.id === citation.referenceId);
    return { citation, record };
  });
  const filename = `${page.type}-${page.slug.replace(/[^a-zA-Z0-9_-]/g, "-")}-references`;
  try {
    if (format === "json") {
      const payload = { schemaVersion: 1, page, references: entries.map(({ citation: c, record }) => ({ key: c.citationKey, text: c.text, url: c.url, locator: c.locator, note: c.note, role: c.role, bibliography: record ? publicBibliographyRecord(record) : null })) };
      return new Response(JSON.stringify(payload, null, 2), { headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.json"` } });
    }
    const bibliography: BibliographicReference[] = entries.map(({ citation: c, record }) => record
      ? { ...record, citationNote: [c.locator, c.note, c.url && c.url !== record.url ? c.url : null].filter(Boolean).join("; ") }
      : { slug: c.citationKey, citationKey: `mw-free-${c.citationKey}`, canonicalTitle: "", referenceType: "OTHER", freeText: c.text, url: c.url, citationNote: [c.locator, c.note].filter(Boolean).join("; ") });
    // Export only dependencies required by this page, and only published metadata.
    const known = new Set(bibliography.map(r => (r.citationKey || `mw-${r.id ?? r.slug}`).toLowerCase()));
    for (let index = 0; index < bibliography.length; index++) {
      if (bibliography.length > 100) throw new Error("Too many bibliography dependencies.");
      const fields = parse(generatedBibtex(bibliography[index]), { raw: true, unsupported: "ignore" }).entries[0].fields;
      const needed = [fields.crossref, fields.xdata].filter((value): value is string => typeof value === "string").flatMap(value => value.split(",").map(key => key.trim())).filter(key => !known.has(key.toLowerCase()));
      for (const key of needed) {
        if (known.has(key.toLowerCase())) continue;
        const dependency = await db.libraryReference.findFirst({ where: { id: { notIn: excludedReferenceIds }, citationKey: { equals: key, mode: "insensitive" }, status: "PUBLISHED", searchable: true, mergedIntoId: null } });
        if (!dependency) throw new Error("A bibliography dependency is unavailable. Please ask for the reference record to be corrected.");
        known.add(key.toLowerCase()); bibliography.push(dependency);
      }
    }
    return new Response(exportReferenceBibtex(bibliography), { headers: { ...headers, "Content-Type": "application/x-bibtex; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.bib"` } });
  } catch {
    return Response.json({ error: page.language === "fr" ? "Une fiche bibliographique doit être corrigée avant cet export. Les références restent consultables sur la page." : "A bibliography record needs correction before export. References remain readable on the page." }, { status: 422, headers });
  }
}
