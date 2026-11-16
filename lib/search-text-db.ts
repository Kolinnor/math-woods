import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { foldedSql } from "./reference-search.ts";
import { searchPhrase } from "./search-text.ts";

const sources = {
  concept: { table: Prisma.sql`"Concept"`, title: [Prisma.sql`s.title`, Prisma.sql`s.slug`], body: [Prisma.sql`s."bodyMarkdown"`] },
  problem: { table: Prisma.sql`"Problem"`, title: [Prisma.sql`s.title`, Prisma.sql`s.slug`], body: [Prisma.sql`s."bodyMarkdown"`] },
  alias: { table: Prisma.sql`"ConceptAlias"`, title: [Prisma.sql`s.alias`], body: [] },
  quote: { table: Prisma.sql`"Quote"`, title: [Prisma.sql`s.text`, Prisma.sql`s."attributedTo"`], body: [Prisma.sql`s.provenance`, Prisma.sql`s."provenanceDetails"`] },
  exploration: { table: Prisma.sql`"Playlist"`, title: [Prisma.sql`s.title`], body: [Prisma.sql`s.summary`, Prisma.sql`s."descriptionMarkdown"`, Prisma.sql`s.audience`] }
};

/** Candidate IDs only. Callers MUST retain their ordinary visibility/language filters.
 * Fold stored text as well as the query, before pagination, including legacy slugs.
 * No dynamic identifiers or user-supplied SQL; punctuation such as % is literal.
 */
export async function matchingSearchTextIds(
  kind: keyof typeof sources,
  variants: readonly string[],
  { exact = false, titleOnly = false }: { exact?: boolean; titleOnly?: boolean } = {}
): Promise<number[]> {
  const queries = [...new Set(variants.map(searchPhrase).filter(Boolean))];
  if (!queries.length) return [];
  const source = sources[kind];
  const fields = titleOnly ? source.title : [...source.title, ...source.body];
  const predicates = fields.flatMap(field => queries.map(query => exact
    ? Prisma.sql`trim(${foldedSql(field)}) = ${query}`
    : Prisma.sql`strpos(${foldedSql(field)}, ${query}) > 0`));
  const rows = await prisma.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT s.id FROM ${source.table} s WHERE ${Prisma.join(predicates, " OR ")}`);
  return rows.map(row => row.id);
}
