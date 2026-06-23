import { notFound } from "next/navigation";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
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
      author: problem.author.username,
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
      .map((proof, index) => `\n\n## Proof ${index + 1}\n\n_By @${proof.author.username}_\n\n${proof.bodyMarkdown}`)
      .join("");

  return markdownResponse(markdown, `${problem.slug}.md`);
}
