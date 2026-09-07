import type { Prisma } from "@prisma/client";
import { renderInlineMarkdown } from "@/lib/markdown";
import type { MathematicianRelatedInput, MathematicianRelatedView, RelatedCategory } from "./mathematician-related";

export const mathematicianRelatedInclude = { reference: { include: { translations: true } }, concept: true, problem: true } as const;
type Stored = Prisma.MathematicianRelatedItemGetPayload<{ include: typeof mathematicianRelatedInclude }>;

export async function relatedItemViews(rows: Stored[], language: string): Promise<MathematicianRelatedView[]> {
  return Promise.all(rows.map(async row => {
    const href = row.reference?.status === "PUBLISHED" ? `/library/references/${row.reference.slug}`
      : row.concept && row.concept.status !== "MISSING" ? `/concepts/${row.concept.slug}?viewLanguage=${row.concept.language}`
      : row.problem?.status === "PUBLISHED" && row.problem.listed ? `/problems/${row.problem.slug}?viewLanguage=${row.problem.language}` : null;
    // Live catalogue metadata stays authoritative. The stored label is a fallback
    // if the target disappears, and the note belongs to this translated entry.
    const reference = row.reference;
    const labelMarkdown = href && reference ? [reference.authors, reference.translations.find(t => t.language === language)?.displayTitle || reference.canonicalTitle, [reference.edition, reference.year].filter(Boolean).join(", ")].filter(Boolean).join(" — ")
      : href && row.concept ? row.concept.title : href && row.problem ? row.problem.title : row.labelMarkdown;
    return { key: row.key, category: row.category as RelatedCategory, labelMarkdown, noteMarkdown: row.noteMarkdown, relation: row.relation,
      referenceId: row.referenceId, conceptId: row.conceptId, problemId: row.problemId, href,
      titleHtml: await renderInlineMarkdown(labelMarkdown), unavailable: Boolean((row.referenceId || row.conceptId || row.problemId) && !href) };
  }));
}

export async function syncMathematicianRelated(tx: Prisma.TransactionClient, translationId: number, rows: MathematicianRelatedInput[]) {
  const existing = await tx.mathematicianRelatedItem.findMany({ where: { translationId } });
  const byKey = new Map(existing.map(row => [row.key, row]));
  // Retain links that have since been archived; only newly selected targets need to be public.
  for (const row of rows) {
    const previous = byKey.get(row.key);
    for (const field of ["referenceId", "conceptId", "problemId"] as const) {
      const id = row[field];
      if (!id || previous?.[field] === id) continue;
      const found = field === "referenceId" ? await tx.libraryReference.findFirst({ where: { id, status: "PUBLISHED", searchable: true, mergedIntoId: null }, select: { id: true } })
        : field === "conceptId" ? await tx.concept.findFirst({ where: { id, status: { not: "MISSING" } }, select: { id: true } })
        : await tx.problem.findFirst({ where: { id, status: "PUBLISHED", listed: true }, select: { id: true } });
      if (!found) throw new Error("This linked content is no longer available. Remove it or keep a free reference.");
    }
  }
  await tx.mathematicianRelatedItem.deleteMany({ where: { translationId, key: { notIn: rows.map(row => row.key) } } });
  for (const [position, row] of rows.entries()) {
    await tx.mathematicianRelatedItem.upsert({ where: { translationId_key: { translationId, key: row.key } }, create: { ...row, translationId, position }, update: { ...row, position } });
  }
}
