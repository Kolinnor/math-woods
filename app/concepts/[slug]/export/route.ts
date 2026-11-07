import { contentWithProofs } from "@/lib/concept-proofs";
import { redirectHistoricalContentSlug } from "@/lib/content-slug-redirect";
import { notFound } from "next/navigation";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { parseConceptCitations } from "@/lib/concept-citations";
import { citationText } from "@/lib/problem-citations";
import { pageBibliographyResponse } from "@/lib/page-bibliography";
import { resolveConceptAlias } from "@/lib/concept-alias-search";
import { getPreferredContentLanguage } from "@/lib/server-language";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await redirectHistoricalContentSlug("concept", slug, request.url);
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
    const alias = await resolveConceptAlias(slug, await getPreferredContentLanguage());
    // Language depends on the reader: do not permanently cache this redirect.
    if (alias) return Response.redirect(new URL(`/concepts/${alias.slug}/export${new URL(request.url).search}`, request.url), 307);
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
    contentWithProofs(concept.bodyMarkdown, concept) +
    (citations.length
      ? `\n\n## References\n\n${citations
          .map((reference) => `- ${reference.url ? `[${citationText(reference)}](${reference.url})` : citationText(reference)}${reference.note ? ` — ${reference.note}` : ""}`)
          .join("\n")}\n`
      : "");

  return markdownResponse(markdown, `${concept.slug}.md`);
}
