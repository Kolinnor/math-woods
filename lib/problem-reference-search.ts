import { Prisma } from "@prisma/client";
import { hasTrustedPrivileges, type PermissionUser } from "./permissions.ts";
import { foldedSql, referenceSearchWords } from "./reference-search.ts";

const LOCATION_WORDS = new Set(["livre", "book", "chapitre", "chapter", "proposition", "prop", "theoreme", "theorem", "tome", "volume", "vol", "page", "p"]);

function roman(number: number) {
  let result = "";
  for (const [value, symbol] of [[1000,"m"],[900,"cm"],[500,"d"],[400,"cd"],[100,"c"],[90,"xc"],[50,"l"],[40,"xl"],[10,"x"],[9,"ix"],[5,"v"],[4,"iv"],[1,"i"]] as const) {
    while (number >= value) { result += symbol; number -= value; }
  }
  return result;
}

export function problemReferenceSearchTerms(query: string) {
  const words = referenceSearchWords(query, false);
  return words.map((word, index) => {
    let number = /^\d+$/.test(word) ? Number(word) : null;
    if (number === null && LOCATION_WORDS.has(words[index - 1]) && /^[ivxlcdm]+$/.test(word)) {
      const values: Record<string, number> = { i:1,v:5,x:10,l:50,c:100,d:500,m:1000 };
      number = [...word].reduce((total, char, i) => total + (values[char] < (values[word[i + 1]] ?? 0) ? -values[char] : values[char]), 0);
      if (number < 1 || number > 3999 || roman(number) !== word) number = null;
    }
    return {
      alternatives: number !== null && number > 0 && number <= 3999 ? [String(number), roman(number)] : [word],
      wholeWord: number !== null,
      location: number !== null && LOCATION_WORDS.has(words[index - 1]) ? words[index - 1] : undefined
    };
  });
}

export type ProblemReferenceMatch = { id: number; translationGroupId: string; label: string };

/** Search only citations the viewer can read. Filtering happens before pagination;
 * a hidden reference must not reveal a problem through a match or a result count.
 * Legacy origin fields are used only when no structured citations exist.
 */
export async function matchingProblemReferences(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  query: string,
  user: PermissionUser | null,
  exact = false
): Promise<ProblemReferenceMatch[]> {
  const terms = problemReferenceSearchTerms(query);
  if (!terms.length) return [];
  const canReveal = !user ? Prisma.sql`FALSE` : hasTrustedPrivileges(user.role) ? Prisma.sql`TRUE` : Prisma.sql`(
    p."authorId" = ${user.id} OR EXISTS (
      SELECT 1 FROM "ProblemAttempt" a JOIN "Problem" solved ON solved.id = a."problemId"
      WHERE a."userId" = ${user.id} AND a.status = 'SOLVED' AND solved."translationGroupId" = p."translationGroupId"
    ))`;
  const match = exact
    ? Prisma.sql`${referenceSearchWords(query, false).join(" ")} = ANY (s.fields)`
    : Prisma.join(terms.map(term => term.wholeWord
      ? Prisma.sql`s.document ~ ${`(^| )${term.location ? `${term.location}s? (?:n |no |numero |number )?` : ""}(${term.alternatives.join("|")})( |$)`}`
      : Prisma.sql`strpos(s.document, ${term.alternatives[0]}) > 0`), " AND ");
  const rows = await db.$queryRaw<ProblemReferenceMatch[]>(Prisma.sql`
    WITH sources AS (
      SELECT p.id, p."translationGroupId", c.position, c.id AS "citationId",
        ARRAY[c.text, c.locator, c.note, r."canonicalTitle", r.authors,
          array_to_string(r.aliases, ' '),
          (SELECT string_agg(t."displayTitle", ' ') FROM "LibraryReferenceTranslation" t WHERE t."referenceId" = r.id)] AS fields,
        concat_ws(' — ', NULLIF(r.authors, ''), NULLIF(c.text, ''),
          CASE WHEN r."canonicalTitle" IS DISTINCT FROM c.text THEN NULLIF(r."canonicalTitle", '') END,
          NULLIF(c.locator, ''), NULLIF(c.note, '')) AS label
      FROM "Problem" p
      JOIN "ProblemLibraryReference" c ON c."problemId" = p.id
      LEFT JOIN "LibraryReference" r ON r.id = c."referenceId"
        AND r.status = 'PUBLISHED' AND r.searchable AND r."mergedIntoId" IS NULL
      WHERE p.status = 'PUBLISHED' AND p.listed AND (NOT c.spoiler OR ${canReveal})
      UNION ALL
      SELECT p.id, p."translationGroupId", 0, 0,
        ARRAY[p.origin, p."originChapter", p."originPage", p."originNote"],
        concat_ws(' — ', NULLIF(p.origin, ''), NULLIF(p."originChapter", ''), NULLIF(p."originPage", ''), NULLIF(p."originNote", ''))
      FROM "Problem" p
      WHERE p.status = 'PUBLISHED' AND p.listed
        AND NOT EXISTS (SELECT 1 FROM "ProblemLibraryReference" c WHERE c."problemId" = p.id)
    ), searchable AS MATERIALIZED (
      SELECT id, "translationGroupId", position, "citationId", label,
        ${foldedSql(Prisma.sql`array_to_string(fields, ' ')`)} AS document,
        ARRAY(SELECT trim(${foldedSql(Prisma.sql`field`)}) FROM unnest(fields) field) AS fields
      FROM sources
    )
    SELECT DISTINCT ON (s.id) s.id, s."translationGroupId", s.label
    FROM searchable s WHERE ${match}
    ORDER BY s.id, s.position, s."citationId"
  `);
  return rows.map(row => ({ ...row, label: compactProblemReferenceLabel(row.label) }));
}

export function compactProblemReferenceLabel(label: string) {
  const seen = new Set<string>();
  const compact = label.replace(/\s+/g, " ").trim().split(" — ").filter(part => {
    const key = referenceSearchWords(part).join(" ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" — ");
  return compact.length > 280 ? `${compact.slice(0, 277).trimEnd()}…` : compact;
}
