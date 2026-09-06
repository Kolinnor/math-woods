import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isVerifiedContributor } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { getInterfaceLocale } from "@/lib/i18n/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isVerifiedContributor(user)) return NextResponse.json({ error: "Sign in to search references." }, { status: 403 });
  try { await assertRateLimit(`reference-search:${user.id}`, 90, 60_000); }
  catch { return NextResponse.json({ error: "Too many searches. Please try again shortly." }, { status: 429 }); }
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 120);
  const workId = params.has("workId") ? Number(params.get("workId")) : null;
  const worksOnly = params.get("worksOnly") === "1";
  if (workId !== null && (!Number.isSafeInteger(workId) || workId < 1)) return NextResponse.json({ error: "Invalid work." }, { status: 400 });
  if (workId === null && query.length < 2) return NextResponse.json({ references: [], more: false });
  if (workId !== null && !await prisma.libraryReference.findFirst({ where: { id: workId, status: "PUBLISHED", searchable: true, mergedIntoId: null }, select: { id: true } })) return NextResponse.json({ references: [], more: false });
  const offset = Math.min(1000, Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0));
  const words = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  const conditions = (workId ? [] : words).map((word) => Prisma.sql`strpos(
    translate(lower(concat_ws(' ', r."canonicalTitle", r."authors", r."publisher", r."year"::text, r."doi", r."isbn", r."citationKey", r."url",
      r.edition, r.volume, r.translator, r.journal, array_to_string(r."aliases", ' '), (SELECT string_agg(t."displayTitle", ' ') FROM "LibraryReferenceTranslation" t WHERE t."referenceId" = r.id),
      (SELECT string_agg(concat_ws(' ', e."canonicalTitle", e.authors, e.publisher, e.year::text, e.edition, e.volume, e.translator, e.doi, e.isbn, e."citationKey", array_to_string(e.aliases, ' '),
        (SELECT string_agg(et."displayTitle", ' ') FROM "LibraryReferenceTranslation" et WHERE et."referenceId" = e.id)), ' ')
       FROM "LibraryReference" e WHERE e."workId" = r.id AND e.status = 'PUBLISHED' AND e.searchable AND e."mergedIntoId" IS NULL))),
      'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'), ${word}) > 0`);
  const locale = await getInterfaceLocale();
  const references = await prisma.$queryRaw<Array<{ id: number; title: string; authors: string | null; publisher: string | null; year: number | null; url: string | null; edition: string | null; volume: string | null; translator: string | null; editionCount: number }>>(Prisma.sql`
    SELECT r.id, COALESCE((SELECT NULLIF(t."displayTitle", '') FROM "LibraryReferenceTranslation" t WHERE t."referenceId" = r.id AND t.language = ${locale} LIMIT 1), r."canonicalTitle") AS title, r.authors, r.publisher, r.year, r.url, r.edition, r.volume, r.translator,
      (SELECT count(*)::int FROM "LibraryReference" e WHERE e."workId" = r.id AND e.status = 'PUBLISHED' AND e.searchable AND e."mergedIntoId" IS NULL) AS "editionCount"
    FROM "LibraryReference" r
    WHERE r.status = 'PUBLISHED' AND r.searchable AND r."mergedIntoId" IS NULL
      AND ${workId ? Prisma.sql`r."workId" = ${workId}` : worksOnly ? Prisma.sql`r."workId" IS NULL AND r."referenceType" = 'BOOK'` : Prisma.sql`(r."workId" IS NULL OR NOT EXISTS (SELECT 1 FROM "LibraryReference" p WHERE p.id = r."workId" AND p.status = 'PUBLISHED' AND p.searchable AND p."mergedIntoId" IS NULL))`}
      AND ${conditions.length ? Prisma.join(conditions, " AND ") : Prisma.sql`TRUE`}
    ORDER BY CASE WHEN lower(r."canonicalTitle") = lower(${query}) THEN 0 ELSE 1 END, r."canonicalTitle", r.id
    LIMIT 11 OFFSET ${offset}`);
  return NextResponse.json({ references: references.slice(0, 10), more: references.length > 10 }, { headers: { "Cache-Control": "private, no-store" } });
}
