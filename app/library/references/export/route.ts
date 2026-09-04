import { LibraryReferenceType, LibraryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canUseAdminTools } from "@/lib/permissions";

function cleanBibtexValue(value: string) {
  return value.replace(/[{}]/g, "").trim();
}

function fallbackBibtex(reference: {
  citationKey: string | null;
  slug: string;
  referenceType: LibraryReferenceType;
  canonicalTitle: string;
  authors: string | null;
  publisher: string | null;
  year: number | null;
  url: string | null;
  doi: string | null;
  isbn: string | null;
}) {
  const entryType = reference.referenceType === LibraryReferenceType.BOOK ? "book" : reference.referenceType === LibraryReferenceType.ARTICLE ? "article" : "misc";
  const fields = [
    ["title", reference.canonicalTitle],
    ["author", reference.authors],
    ["publisher", reference.publisher],
    ["year", reference.year?.toString()],
    ["url", reference.url],
    ["doi", reference.doi],
    ["isbn", reference.isbn]
  ].filter((field): field is [string, string] => Boolean(field[1]));
  return `@${entryType}{${reference.citationKey ?? reference.slug},\n${fields.map(([key, value]) => `  ${key} = {${cleanBibtexValue(value)}}`).join(",\n")}\n}`;
}

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
    where: { status: LibraryStatus.PUBLISHED },
    include: { translations: true },
    orderBy: { canonicalTitle: "asc" }
  });
  if (format === "json") {
    const publicReferences = references.map((reference) => ({
      slug: reference.slug,
      type: reference.referenceType,
      title: reference.canonicalTitle,
      authors: reference.authors,
      publisher: reference.publisher,
      year: reference.year,
      url: reference.url,
      doi: reference.doi,
      isbn: reference.isbn,
      citationKey: reference.citationKey,
      bibtex: reference.bibtex,
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
  return new Response(references.map((reference) => reference.bibtex?.trim() || fallbackBibtex(reference)).join("\n\n"), {
    headers: { "Content-Type": "application/x-bibtex; charset=utf-8", "Content-Disposition": "attachment; filename=math-woods-references.bib", "Cache-Control": "private, no-store" }
  });
}
