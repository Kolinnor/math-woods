import { CONCEPT_MAP_MAX_TIER, getConceptMapResponse } from "@/lib/concept-map-data";
import { parseActiveContentLanguage } from "@/lib/languages";

export const dynamic = "force-dynamic";

// Public concept data, identical for every visitor of the same language and tier.
// Retain the layout cache and let repeat visits revalidate a short-lived response.
const CACHE_CONTROL = "public, max-age=30";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const language = parseActiveContentLanguage(url.searchParams.get("lang"));
  const requestedTier = Number(url.searchParams.get("tier"));
  const tier = Number.isInteger(requestedTier) ? Math.min(Math.max(requestedTier, 1), CONCEPT_MAP_MAX_TIER) : 1;
  const response = await getConceptMapResponse(language, tier);
  const headers = {
    "Cache-Control": CACHE_CONTROL,
    "Content-Language": language,
    ETag: response.etag,
    Vary: "Accept-Encoding"
  };
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((tag) => tag.trim().replace(/^W\//, "") === response.etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(response.body, {
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}
