import { LibraryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";
import { exportReferenceBibtex, generatedBibtex, upgradeLegacyBibliography } from "@/lib/reference-bibtex";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !canUseAdminTools(user)) {
    return Response.json({ error: "Administrator access required." }, {
      status: user ? 403 : 401,
      headers: { "Cache-Control": "private, no-store" }
    });
  }
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "bibtex";
  const references = await prisma.libraryReference.findMany({
    where: { status: LibraryStatus.PUBLISHED, searchable: true, mergedIntoId: null },
    include: { translations: true, work: { select: { slug: true } } },
    orderBy: { canonicalTitle: "asc" }
  });
  try {
  if (format === "json") {
    const publicReferences = references.map(upgradeLegacyBibliography).map((reference) => ({
      slug: reference.slug,
      workSlug: reference.work?.slug ?? null,
      type: reference.referenceType,
      title: reference.canonicalTitle,
      authors: reference.authors,
      publisher: reference.publisher,
      year: reference.year,
      yearLabel: reference.yearLabel,
      edition: reference.edition,
      volume: reference.volume,
      translator: reference.translator,
      editors: reference.editors,
      journal: reference.journal,
      issue: reference.issue,
      pages: reference.pages,
      url: reference.url,
      doi: reference.doi,
      isbn: reference.isbn,
      citationKey: reference.citationKey,
      bibtex: generatedBibtex(reference),
      originalBibtex: reference.bibtex,
      translations: reference.translations.map((translation) => ({
        language: translation.language,
        title: translation.displayTitle,
        descriptionMarkdown: translation.descriptionMarkdown
      }))
    }));
    return new Response(JSON.stringify(publicReferences, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=math-woods-references.json", "Cache-Control": "private, no-store" }
    });
  }
  return new Response(exportReferenceBibtex(references), {
    headers: { "Content-Type": "application/x-bibtex; charset=utf-8", "Content-Disposition": "attachment; filename=math-woods-references.bib", "Cache-Control": "private, no-store" }
  });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to export BibTeX. Correct the bibliography records and try again." }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
  }
}
