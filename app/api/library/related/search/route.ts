import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { renderInlineMarkdown } from "@/lib/markdown";
import { selectContentTranslationsByGroup } from "@/lib/translation-routing";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) return Response.json({ results: [] }, { status: 403, headers });
  try { await assertRateLimit(`library-related:${user.id}`, 90, 60_000); }
  catch { return Response.json({ results: [] }, { status: 429, headers }); }
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 120), kind = params.get("kind"), language = params.get("lang") === "en" ? "en" : "fr";
  if (q.length < 2) return Response.json({ results: [] }, { headers });
  const offset = Math.min(10000, Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0));
  let matches: Array<{ id: number; title: string; href: string; language?: string }>;
  if (kind === "WORK" || kind === "SOURCE" || kind === "LEGACY") {
    const rows = await prisma.libraryReference.findMany({ where: { status: "PUBLISHED", searchable: true, mergedIntoId: null, OR: [{ canonicalTitle: { contains: q, mode: "insensitive" } }, { authors: { contains: q, mode: "insensitive" } }, { aliases: { has: q } }, { translations: { some: { displayTitle: { contains: q, mode: "insensitive" } } } }] }, include: { translations: true }, orderBy: [{ canonicalTitle: "asc" }, { id: "asc" }], skip: offset, take: 11 });
    matches = rows.map(r => ({ id: r.id, title: [r.authors, r.translations.find(t => t.language === language)?.displayTitle || r.canonicalTitle, [r.edition, r.year].filter(Boolean).join(", ")].filter(Boolean).join(" — "), href: `/library/references/${r.slug}` }));
  } else if (kind === "CONCEPT" || kind === "PROBLEM") {
    const where = { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q, mode: "insensitive" as const } }] };
    const select = { id: true, title: true, slug: true, language: true, translationGroupId: true };
    const rows = kind === "CONCEPT" ? await prisma.concept.findMany({ where: { ...where, status: { not: "MISSING" } }, select, orderBy: [{ title: "asc" }, { id: "asc" }] })
      : await prisma.problem.findMany({ where: { ...where, status: "PUBLISHED", listed: true }, select, orderBy: [{ title: "asc" }, { id: "asc" }] });
    matches = selectContentTranslationsByGroup(rows, language).slice(offset, offset + 11).map(r => ({ ...r, href: `/${kind === "CONCEPT" ? "concepts" : "problems"}/${r.slug}?viewLanguage=${r.language}` }));
  } else return Response.json({ results: [] }, { status: 400, headers });
  return Response.json({ more: matches.length > 10, results: await Promise.all(matches.slice(0, 10).map(async r => ({ ...r, titleHtml: await renderInlineMarkdown(r.title) }))) }, { headers });
}
