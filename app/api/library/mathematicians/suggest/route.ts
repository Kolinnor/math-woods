import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { searchMathematicians, visibleLibraryEntryWhere } from "@/lib/library-queries";
import { mathematicianName, normalizeMathematicianName } from "@/lib/mathematician-names";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "private, no-store" };
  // The Library remains reserved to admins/owners, including this search API.
  if (!user || !canUseAdminTools(user)) return Response.json({ mathematicians: [] }, { status: 403, headers });
  await assertRateLimit(`mathematician-suggestions:${user.id}`, 120, 60_000);
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").trim().slice(0, 160);
  if (normalizeMathematicianName(query).length < 2) return Response.json({ mathematicians: [] }, { headers });
  const locale = params.get("lang") === "fr" ? "fr" : "en";
  const exclude = Number(params.get("exclude"));
  const where = { AND: [visibleLibraryEntryWhere(user), Number.isSafeInteger(exclude) && exclude > 0 ? { id: { not: exclude } } : {}] };
  const matches = await searchMathematicians(query, locale, where, true);
  return Response.json({ mathematicians: matches.slice(0, 5).map(person => ({
    id: person.id, slug: person.slug, name: mathematicianName(person, locale), lifespan: person.lifespan, portraitUrl: person.portraitUrl, portraitCrop: person.portraitCrop
  })) }, { headers });
}
