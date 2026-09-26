import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { localizedTranslation, searchMathematicians } from "@/lib/library-queries";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { matchingReferenceIds } from "@/lib/reference-search";

export const dynamic = "force-dynamic";

/** Published library entries matching a query, for pickers such as the homepage selection. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getCurrentUser();
  // The Library remains reserved to admins/owners, including this search API.
  if (!user || !canUseAdminTools(user)) return Response.json({ results: [] }, { status: 403, headers });
  try { await assertRateLimit(`library-entry-search:${user.id}`, 120, 60_000); }
  catch { return Response.json({ results: [] }, { status: 429, headers }); }
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 120);
  const kind = params.get("kind");
  const language = params.get("lang") === "en" ? "en" : "fr";
  if (q.length < 2) return Response.json({ results: [] }, { headers });

  if (kind === "mathematician") {
    const people = await searchMathematicians(q, language);
    return Response.json({ results: people.slice(0, 8).map(person => ({ id: person.id, label: localizedTranslation(person.translations, language)?.displayName ?? person.name, detail: person.lifespan })) }, { headers });
  }
  if (kind === "milestone") {
    const rows = await prisma.historyMilestone.findMany({
      where: { status: "PUBLISHED", translations: { some: { OR: [{ title: { contains: q, mode: "insensitive" } }, { yearLabel: { contains: q, mode: "insensitive" } }] } } },
      select: { id: true, slug: true, sortYear: true, translations: { select: { language: true, title: true, yearLabel: true } } },
      orderBy: [{ sortYear: "asc" }, { id: "asc" }],
      take: 8
    });
    return Response.json({ results: rows.map(row => { const translation = localizedTranslation(row.translations, language); return { id: row.id, label: translation?.title ?? row.slug, detail: translation?.yearLabel ?? String(row.sortYear) }; }) }, { headers });
  }
  if (kind === "reference") {
    const ids = await matchingReferenceIds(prisma, q);
    const rows = await prisma.libraryReference.findMany({
      where: { id: { in: ids }, status: "PUBLISHED", searchable: true, mergedIntoId: null },
      select: { id: true, canonicalTitle: true, authors: true, year: true, yearLabel: true, translations: { select: { language: true, displayTitle: true } } },
      orderBy: [{ canonicalTitle: "asc" }, { id: "asc" }],
      take: 8
    });
    return Response.json({ results: rows.map(row => ({ id: row.id, label: localizedTranslation(row.translations, language)?.displayTitle ?? row.canonicalTitle, detail: [row.authors, row.yearLabel ?? row.year].filter(Boolean).join(" · ") })) }, { headers });
  }
  return Response.json({ results: [] }, { status: 400, headers });
}
