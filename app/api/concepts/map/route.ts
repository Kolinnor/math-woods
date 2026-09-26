import { CONCEPT_MAP_MAX_TIER, getConceptMapResponse } from "@/lib/concept-map-data";
import { parseActiveContentLanguage } from "@/lib/languages";
import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// The map is an admin-only preview. Keep the server-side layout cache, but never
// let a browser or shared HTTP cache reuse a response after the session changes.
const CACHE_CONTROL = "private, no-store";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) {
    return Response.json({ error: "Administrator access required." }, {
      status: user ? 403 : 401,
      headers: { "Cache-Control": CACHE_CONTROL, Vary: "Cookie, Accept-Encoding" }
    });
  }
  const url = new URL(request.url);
  const language = parseActiveContentLanguage(url.searchParams.get("lang"));
  const requestedTier = Number(url.searchParams.get("tier"));
  const tier = Number.isInteger(requestedTier) ? Math.min(Math.max(requestedTier, 1), CONCEPT_MAP_MAX_TIER) : 1;
  const response = await getConceptMapResponse(language, tier);
  const headers = {
    "Cache-Control": CACHE_CONTROL,
    "Content-Language": language,
    ETag: response.etag,
    Vary: "Cookie, Accept-Encoding"
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim().replace(/^W\//, "") === response.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(response.body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}
