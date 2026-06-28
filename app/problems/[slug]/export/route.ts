import { notFound } from "next/navigation";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
      domains: { orderBy: { position: "asc" } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      spoilerTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      proofs: { include: { author: true }, orderBy: { createdAt: "asc" } }
    }
  });

  if (!problem) notFound();

  const markdown =
    frontmatter({
      type: "problem",
      title: problem.title,
      slug: problem.slug,
      language: problem.language,
      translationGroupId: problem.translationGroupId,
      author: problem.author.username,
      domains: problem.domains.length ? problem.domains.map((domain) => domain.mscCode) : [problem.domain],
      spoilerDomains: problem.domains.filter((domain) => domain.spoiler).map((domain) => domain.mscCode),
      tags: problem.tags.map(({ tag }) => tag.name),
      spoilerTags: problem.spoilerTags.map(({ tag }) => tag.name),
      difficulty: problem.difficulty,
      qualityStatus: problem.qualityStatus.toLowerCase(),
      listed: problem.listed,
      origin: problem.origin,
      originChapter: problem.originChapter,
      originPage: problem.originPage,
      originNote: problem.originNote
    }) +
    problem.bodyMarkdown +
    problem.proofs
      .map((proof, index) => `\n\n## Solution ${index + 1}\n\n_By @${proof.author.username}_\n\n${proof.bodyMarkdown}`)
      .join("");

  return markdownResponse(markdown, `${problem.slug}.md`);
}
