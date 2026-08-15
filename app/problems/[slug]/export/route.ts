import { ProblemVerificationMode } from "@prisma/client";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { frontmatter, markdownResponse } from "@/lib/export-markdown";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { canEditProblem } from "@/lib/permissions";
import { normalizeProblemOrigin } from "@/lib/problem-origin";
import { canViewProblem } from "@/lib/problem-visibility";
import { canViewProblemSolutions } from "@/lib/problem-solution-visibility";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
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
  if (!canViewProblem(user, problem)) notFound();

  const solvedAttempt =
    user && problem.verificationMode !== ProblemVerificationMode.NONE
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
    isAuthenticated: Boolean(user),
    requiresVerification: problem.verificationMode !== ProblemVerificationMode.NONE,
    hasSolvedAttempt: solvedAttempt?.status === "SOLVED",
    canEditProblem: Boolean(user && canEditProblem(user, problem))
  });
  const solutionsMarkdown = canExportSolutions
    ? problem.proofs
        .map((proof, index) => `\n\n## Solution ${index + 1}\n\n_By @${proof.author.username}_\n\n${proof.bodyMarkdown}`)
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
      author: problem.author.username,
      domains: problem.domains.length ? problem.domains.map((domain) => domainLabel(domain.mscCode)) : [domainLabel(problem.domain)],
      spoilerDomains: problem.domains.filter((domain) => domain.spoiler).map((domain) => domainLabel(domain.mscCode)),
      tags: problem.tags.map(({ tag }) => tag.name),
      spoilerTags: problem.spoilerTags.map(({ tag }) => tag.name),
      styles: problem.styles.map((style) => style.toLowerCase().replaceAll("_", "-")),
      isConjecture: problem.isConjecture,
      difficulty: problem.difficulty,
      qualityStatus: problem.qualityStatus.toLowerCase(),
      listed: problem.listed,
      origin: normalizeProblemOrigin(problem.origin),
      originChapter: problem.originChapter,
      originPage: problem.originPage,
      originNote: problem.originNote
    }) +
    problem.bodyMarkdown +
    solutionsMarkdown;

  return markdownResponse(markdown, `${problem.slug}.md`);
}
