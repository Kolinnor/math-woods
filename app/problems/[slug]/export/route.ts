import { ProblemVerificationMode } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { canEditProblem } from "@/lib/permissions";
import { citationText, parseProblemCitations, visibleProblemCitations } from "@/lib/problem-citations";
import { canViewProblem } from "@/lib/problem-visibility";
import { canViewProblemSolutions } from "@/lib/problem-solution-visibility";
import { pageBibliographyResponse } from "@/lib/page-bibliography";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const problem = await prisma.problem.findUnique({
    where: { slug },
    include: {
      author: true,
      libraryReferences: { orderBy: { position: "asc" } },
      domains: { orderBy: { position: "asc" } },
      tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      spoilerTags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } },
      proofs: { include: { author: true }, orderBy: { createdAt: "asc" } }
    }
  });

  if (!problem) notFound();
  if (!canViewProblem(user, problem)) notFound();

  const solvedAttempt =
    user
      ? await prisma.problemAttempt.findFirst({
          where: {
            userId: user.id,
            status: "SOLVED",
            problem: { translationGroupId: problem.translationGroupId }
          },
          select: { status: true }
        })
      : null;
  const canExportSolutions = canViewProblemSolutions({
    requiresVerification: problem.verificationMode !== ProblemVerificationMode.NONE,
    hasSolvedAttempt: solvedAttempt?.status === "SOLVED",
    canEditProblem: Boolean(user && canEditProblem(user, problem))
  });
  const format = new URL(_request.url).searchParams.get("format");
  if (format === "bibtex" || format === "json") {
    const all = parseProblemCitations(problem.libraryReferences);
    const readable = visibleProblemCitations(all, Boolean(solvedAttempt || (user && canEditProblem(user, problem))));
    const excluded = all.filter(c => !readable.some(visible => visible.citationKey === c.citationKey)).flatMap(c => c.referenceId === null ? [] : [c.referenceId]);
    return pageBibliographyResponse(prisma, { type: "problem", slug: problem.slug, title: problem.title, language: problem.language }, readable, format, excluded);
  }
  const solutionsMarkdown = canExportSolutions
    ? problem.proofs
        .map((proof, index) => `\n\n## Solution ${index + 1}\n\n_By @${proof.author.profileSlug}_\n\n${proof.bodyMarkdown}`)
        .join("")
    : problem.proofs.length
      ? "\n\n## Solutions\n\nSolutions are hidden until your answer has been verified."
      : "";

  const markdown =
    frontmatter({
      type: "problem",
      title: problem.title,
      slug: problem.slug,
      language: problem.language,
      translationGroupId: problem.translationGroupId,
      author: problem.author.profileSlug,
      domains: problem.domains.length ? problem.domains.map((domain) => domainLabel(domain.mscCode)) : [domainLabel(problem.domain)],
      spoilerDomains: problem.domains.filter((domain) => domain.spoiler).map((domain) => domainLabel(domain.mscCode)),
      tags: problem.tags.map(({ tag }) => tag.name),
      spoilerTags: problem.spoilerTags.map(({ tag }) => tag.name),
      styles: problem.styles.map((style) => style.toLowerCase().replaceAll("_", "-")),
      isConjecture: problem.isConjecture,
      isOriginal: problem.isOriginal,
      difficulty: problem.difficulty,
      qualityStatus: problem.qualityStatus.toLowerCase(),
      listed: problem.listed,
      references: visibleProblemCitations(parseProblemCitations(problem.libraryReferences), Boolean(solvedAttempt || (user && canEditProblem(user, problem))))
        .map((citation) => [citationText(citation), citation.url, citation.note].filter(Boolean).join(" — "))
    }) +
    problem.bodyMarkdown +
    solutionsMarkdown;

  return markdownResponse(markdown, `${problem.slug}.md`);
}
