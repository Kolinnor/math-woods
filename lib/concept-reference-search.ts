import { Prisma } from "@prisma/client";
import { foldedSql, referenceSearchWords } from "./reference-search.ts";

/** Search free citations and published/searchable library references only.
 * Legacy rows mirror structured citations, so only use them when no structured
 * citations exist: otherwise they could reintroduce a hidden reference.
 */
export async function matchingConceptReferences(db: Pick<Prisma.TransactionClient, "$queryRaw">, query: string) {
  const words = referenceSearchWords(query);
  if (!words.length) return [];
  return db.$queryRaw<Array<{ id: number; label: string }>>(Prisma.sql`
    WITH sources AS (
      SELECT c."conceptId" AS id, concat_ws(' ', c.text, c.locator, c.note,
        r."canonicalTitle", r.authors, array_to_string(r.aliases, ' '),
        (SELECT string_agg(t."displayTitle", ' ') FROM "LibraryReferenceTranslation" t WHERE t."referenceId" = r.id)) AS document
      FROM "ConceptLibraryReference" c
      LEFT JOIN "LibraryReference" r ON r.id = c."referenceId"
        AND r.status = 'PUBLISHED' AND r.searchable AND r."mergedIntoId" IS NULL
      WHERE c."referenceId" IS NULL OR r.id IS NOT NULL
      UNION ALL
      SELECT c."conceptId", concat_ws(' ', c.title, c.note) FROM "ConceptReference" c
      WHERE NOT EXISTS (SELECT 1 FROM "ConceptLibraryReference" structured WHERE structured."conceptId" = c."conceptId")
    ), searchable AS MATERIALIZED (
      SELECT id, document AS label, ${foldedSql(Prisma.sql`document`)} AS document FROM sources
    )
    SELECT DISTINCT ON (id) id, label FROM searchable s
    WHERE ${Prisma.join(words.map(word => Prisma.sql`strpos(s.document, ${word}) > 0`), " AND ")}
    ORDER BY id, label
  `);
}
