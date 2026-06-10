import { notFound } from "next/navigation";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: {
      lastEditedBy: true,
      aliases: { orderBy: { alias: "asc" } },
      references: { orderBy: { position: "asc" } }
    }
  });

  if (!concept) notFound();

  const markdown =
    frontmatter({
      type: "concept",
      title: concept.title,
      slug: concept.slug,
      domain: concept.domain.toLowerCase(),
      status: concept.status.toLowerCase(),
      aliases: concept.aliases.map((alias) => alias.alias),
      lastEditedBy: concept.lastEditedBy?.username
    }) +
    concept.bodyMarkdown +
    (concept.references.length
      ? `\n\n## References\n\n${concept.references
          .map((reference) => `- ${reference.url ? `[${reference.title}](${reference.url})` : reference.title}${reference.note ? ` — ${reference.note}` : ""}`)
          .join("\n")}\n`
      : "");

  return markdownResponse(markdown, `${concept.slug}.md`);
}
