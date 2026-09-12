import { Prisma } from "@prisma/client";
import { GET as conceptsGET } from "@/app/api/concepts/suggest/route";
import { GET as problemsGET } from "@/app/api/problems/suggest/route";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canUseAdminTools } from "@/lib/permissions";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { assertRateLimit } from "@/lib/rate-limit";
import { clientAddressFromHeaders } from "@/lib/request-security";
import { rankSearchMatches } from "@/lib/search-ranking";
import { foldedSql, referenceMatchSql, referenceSearchWords } from "@/lib/reference-search";
import { renderInlineMarkdown } from "@/lib/markdown";
import { EDITOR_LINK_TYPES, type EditorLinkSuggestion } from "@/lib/editor-links";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
type LibraryMatch = { slug: string; title: string; aliases: string[]; language?: string; meta?: string };

export async function GET(request: Request) {
  const user = await getCurrentUser();
  // The entire Library currently requires admin access, including published pages.
  const availableTypes = user && canUseAdminTools(user) ? [...EDITOR_LINK_TYPES] : ["concept", "problem"];
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 80), type = params.get("type") ?? "all";
  if (type !== "all" && !EDITOR_LINK_TYPES.includes(type as typeof EDITOR_LINK_TYPES[number])) return Response.json({ error: "Invalid type" }, { status: 400, headers });
  if (q.length < 2 || (type !== "all" && !availableTypes.includes(type))) return Response.json({ results: [], availableTypes }, { headers });
  try { await assertRateLimit(`editor-links:${user?.id ?? clientAddressFromHeaders(request.headers)}`, 90, 60_000); }
  catch { return Response.json({ error: "Too many searches" }, { status: 429, headers }); }
  const language = await getPreferredContentLanguage();
  const wants = (kind: string) => availableTypes.includes(kind) && (type === "all" || type === kind);
  const libraryQuery = q.replace(/^(?:(?:le|la|les|un|une|des|the|a|an)\s+|l['’])/i, "").trim() || q;
  const words = referenceSearchWords(libraryQuery);
  const matches = (value: Prisma.Sql) => words.length ? Prisma.join(words.map(word => Prisma.sql`strpos(${foldedSql(value)}, ${word}) > 0`), " AND ") : Prisma.sql`FALSE`;
  const searches: Promise<EditorLinkSuggestion[]>[] = [];
  if (wants("concept")) searches.push(conceptsGET(new Request(`${new URL(request.url).origin}/api/concepts/suggest?q=${encodeURIComponent(q)}`)).then(r => r.json()).then(data => data.concepts.map((row: LibraryMatch) => ({ ...row, targetType: "concept" }))));
  if (wants("problem")) searches.push(problemsGET(new Request(`${new URL(request.url).origin}/api/problems/suggest?listed=1&q=${encodeURIComponent(q)}`)).then(r => r.json()).then(data => data.problems.map((row: LibraryMatch) => ({ ...row, aliases: [], targetType: "problem" }))));
  async function library(kind: "mathematician" | "history" | "reference", sql: Prisma.Sql) {
    const rows = await prisma.$queryRaw<LibraryMatch[]>(sql);
    return Promise.all(rows.map(async row => ({ ...row, aliases: row.aliases ?? [], targetType: kind, titleHtml: await renderInlineMarkdown(row.title) })));
  }
  if (wants("mathematician")) searches.push(library("mathematician", Prisma.sql`
    SELECT m.slug, COALESCE(t."displayName", m.name) AS title, m.aliases, t.language
    FROM "Mathematician" m
    LEFT JOIN LATERAL (SELECT "displayName", language FROM "MathematicianTranslation" WHERE "mathematicianId" = m.id ORDER BY (language = ${language}) DESC, language LIMIT 1) t ON true
    WHERE m.status = 'PUBLISHED' AND ${matches(Prisma.sql`concat_ws(' ', m.name, m.slug, array_to_string(m.aliases, ' '), (SELECT string_agg("displayName", ' ') FROM "MathematicianTranslation" WHERE "mathematicianId" = m.id))`)}
    ORDER BY (lower(COALESCE(t."displayName", m.name)) = lower(${q})) DESC, title, m.id LIMIT 20`));
  if (wants("history")) searches.push(library("history", Prisma.sql`
    SELECT m.slug, t.title, t.language, t."yearLabel" AS meta
    FROM "HistoryMilestone" m
    JOIN LATERAL (SELECT title, language, "yearLabel" FROM "HistoryMilestoneTranslation" WHERE "milestoneId" = m.id ORDER BY (language = ${language}) DESC, language LIMIT 1) t ON true
    WHERE m.status = 'PUBLISHED' AND ${matches(Prisma.sql`concat_ws(' ', m.slug, (SELECT string_agg(title, ' ') FROM "HistoryMilestoneTranslation" WHERE "milestoneId" = m.id))`)}
    ORDER BY (lower(t.title) = lower(${q})) DESC, t.title, m.id LIMIT 20`));
  if (wants("reference")) searches.push(library("reference", Prisma.sql`
    SELECT r.slug, COALESCE(NULLIF(t."displayTitle", ''), r."canonicalTitle") AS title, r.aliases, t.language,
      concat_ws(' · ', r.authors, r.edition, r.year::text) AS meta
    FROM "LibraryReference" r
    LEFT JOIN LATERAL (SELECT "displayTitle", language FROM "LibraryReferenceTranslation" WHERE "referenceId" = r.id ORDER BY (language = ${language}) DESC, language LIMIT 1) t ON true
    WHERE r.status = 'PUBLISHED' AND r.searchable AND r."mergedIntoId" IS NULL AND ${referenceMatchSql(libraryQuery)}
    ORDER BY (lower(COALESCE(NULLIF(t."displayTitle", ''), r."canonicalTitle")) = lower(${q})) DESC, title, r.id LIMIT 20`));
  const results = rankSearchMatches((await Promise.all(searches)).flat(), q, language).slice(0, 20);
  return Response.json({ results, availableTypes }, { headers });
}
