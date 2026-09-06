import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { importBibtexFields, referenceBibtexReport } from "@/lib/reference-bibtex";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) return Response.json({ error: "Administrator access required." }, { status: 403 });
  try { await assertRateLimit(`bibtex-validation:${user.id}`, 30, 60_000); }
  catch { return Response.json({ error: "Too many requests." }, { status: 429 }); }
  const text = await request.text();
  if (text.length > 100_000) return Response.json({ error: "Request too large." }, { status: 413 });
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const value = (name: string) => typeof data[name] === "string" ? data[name] as string : "";
    if (data.operation === "import") {
      try { return Response.json(importBibtexFields(value("bibtex"), data.language === "fr" ? "fr" : "en"), { headers: { "Cache-Control": "private, no-store" } }); }
      catch (error) { return Response.json({ errors: [error instanceof Error ? error.message : "Invalid BibTeX."] }, { status: 422 }); }
    }
    const report = referenceBibtexReport({
      slug: "preview", canonicalTitle: value("canonicalTitle"), referenceType: value("referenceType"),
      ...Object.fromEntries(["authors", "editors", "publisher", "yearLabel", "edition", "volume", "translator", "journal", "issue", "pages", "url", "doi", "isbn", "citationKey", "bibtex"].map(name => [name, value(name)])),
      year: value("year") && Number.isInteger(Number(value("year"))) ? Number(value("year")) : null
    }, data.language === "fr" ? "fr" : "en");
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
}
