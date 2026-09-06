import { notFound } from "next/navigation";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { parseConceptCitations } from "@/lib/concept-citations";
import { citationText } from "@/lib/problem-citations";
import { pageBibliographyResponse } from "@/lib/page-bibliography";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: {
      lastEditedBy: true,
      aliases: { orderBy: { alias: "asc" } },
      references: { orderBy: { position: "asc" } },
      libraryReferences: { orderBy: { position: "asc" } }
    }
  });

  if (!concept) {
    const merged = await prisma.conceptRedirect.findUnique({
      where: { sourceSlug: slug },
      include: { targetConcept: true }
    });
    if (merged) return Response.redirect(new URL(`/concepts/${merged.targetConcept.slug}/export${new URL(request.url).search}`, request.url), 308);
    const alias = await prisma.conceptAlias.findUnique({ where: { aliasSlug: slug }, include: { concept: { select: { slug: true } } } });
    if (alias) return Response.redirect(new URL(`/concepts/${alias.concept.slug}/export${new URL(request.url).search}`, request.url), 308);
    notFound();
  }

  const citations = parseConceptCitations(concept.libraryReferences);
  const format = new URL(request.url).searchParams.get("format");
  if (format === "bibtex" || format === "json") return pageBibliographyResponse(prisma, { type: "concept", slug: concept.slug, title: concept.title, language: concept.language }, citations, format);
  const markdown =
    frontmatter({
      type: "concept",
      title: concept.title,
      slug: concept.slug,
      language: concept.language,
      translationGroupId: concept.translationGroupId,
      domain: domainLabel(concept.domainCode),
      status: concept.status.toLowerCase(),
      aliases: concept.aliases.map((alias) => alias.alias),
      lastEditedBy: concept.lastEditedBy?.username
    }) +
    concept.bodyMarkdown +
    (citations.length
      ? `\n\n## References\n\n${citations
          .map((reference) => `- ${reference.url ? `[${citationText(reference)}](${reference.url})` : citationText(reference)}${reference.note ? ` — ${reference.note}` : ""}`)
          .join("\n")}\n`
      : "");

  return markdownResponse(markdown, `${concept.slug}.md`);
}
