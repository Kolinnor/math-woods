import { Prisma } from "@prisma/client";

export function referenceSearchWords(query: string) {
  return [...new Set(query.slice(0, 160).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean))];
}

// PostgreSQL's built-in Unicode normalization avoids requiring an unaccent
// extension. User input is always a bound parameter, never a SQL identifier.
function foldedSql(value: Prisma.Sql) {
  const marks = "[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]";
  return Prisma.sql`regexp_replace(
    replace(replace(replace(regexp_replace(lower(normalize(${value}, NFKD)), ${marks}, '', 'g'), 'œ', 'oe'), 'æ', 'ae'), 'ß', 'ss'),
    '[^[:alnum:]]+', ' ', 'g')`;
}

/** Matches every query word anywhere in the bibliographic metadata, in any order.
 * The caller supplies visibility, edition grouping and pagination independently.
 * The reference table must have the fixed SQL alias r.
 */
export function referenceMatchSql(query: string, { includeEditions = false, includeDescriptions = false } = {}) {
  const words = referenceSearchWords(query);
  if (!words.length) return Prisma.sql`FALSE`;
  const ownText = Prisma.sql`concat_ws(' ', r."canonicalTitle", r.authors, r.publisher, r.year::text, r.doi, r.isbn, r."citationKey", r.url,
    r.edition, r.volume, r.translator, r.editors, r.journal, array_to_string(r.aliases, ' '),
    regexp_replace(COALESCE(r.isbn, ''), '[^[:alnum:]]', '', 'g'),
    (SELECT string_agg(concat_ws(' ', t."displayTitle", ${includeDescriptions ? Prisma.sql`t."descriptionMarkdown"` : Prisma.sql`NULL`}), ' ')
     FROM "LibraryReferenceTranslation" t WHERE t."referenceId" = r.id))`;
  const editionText = includeEditions ? Prisma.sql`(SELECT string_agg(concat_ws(' ', e."canonicalTitle", e.authors, e.publisher, e.year::text, e.edition, e.volume, e.translator, e.editors, e.journal, e.doi, e.isbn, e."citationKey", e.url, array_to_string(e.aliases, ' '),
      regexp_replace(COALESCE(e.isbn, ''), '[^[:alnum:]]', '', 'g'),
      (SELECT string_agg(et."displayTitle", ' ') FROM "LibraryReferenceTranslation" et WHERE et."referenceId" = e.id)), ' ')
    FROM "LibraryReference" e WHERE e."workId" = r.id AND e.status = 'PUBLISHED' AND e.searchable AND e."mergedIntoId" IS NULL)` : Prisma.sql`NULL`;
  const text = foldedSql(Prisma.sql`concat_ws(' ', ${ownText}, ${editionText})`);
  return Prisma.join(words.map(word => Prisma.sql`strpos(${text}, ${word}) > 0`), " AND ");
}

// Return only matching IDs; the catalogue keeps its existing permissions and
// counts/pages in Prisma. No reference content is loaded just to match text.
export async function matchingReferenceIds(db: Pick<Prisma.TransactionClient, "$queryRaw">, query: string, { publishedOnly = true, includeDescriptions = false } = {}) {
  const rows = await db.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT r.id FROM "LibraryReference" r
    WHERE r.searchable AND r."mergedIntoId" IS NULL
      AND ${publishedOnly ? Prisma.sql`r.status = 'PUBLISHED'` : Prisma.sql`TRUE`}
      AND ${referenceMatchSql(query, { includeDescriptions })}`);
  return rows.map(row => row.id);
}
