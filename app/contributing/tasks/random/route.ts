import { ConceptStatus, ProblemStatus, QualityStatus, type Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { hasExamplesSection, parseContributionTaskKey, translationSourcesMissingLanguage, type ContributionTaskKey } from "@/lib/contribution-tasks";
import { prisma } from "@/lib/db";
import { pickRandomDifferent } from "@/lib/random-content";

type Candidate = { href: string; slug: string };

function conceptCandidates(where: Prisma.ConceptWhereInput) {
  return prisma.concept.findMany({ where, select: { slug: true } });
}

function problemCandidates(where: Prisma.ProblemWhereInput) {
  return prisma.problem.findMany({ where: { listed: true, status: ProblemStatus.PUBLISHED, ...where }, select: { slug: true } });
}

async function candidatesForTask(task: ContributionTaskKey): Promise<Candidate[]> {
  if (task === "stub-concepts") return (await conceptCandidates({ status: ConceptStatus.STUB })).map(({ slug }) => ({ slug, href: `/concepts/${slug}` }));
  if (task === "usable-concepts") return (await conceptCandidates({ status: ConceptStatus.USABLE })).map(({ slug }) => ({ slug, href: `/concepts/${slug}` }));
  if (task === "edited-concepts") return (await conceptCandidates({ status: { not: ConceptStatus.MISSING }, needsReviewAfterEdit: true })).map(({ slug }) => ({ slug, href: `/concepts/${slug}` }));
  if (task === "concepts-without-exercises") return (await conceptCandidates({ status: { not: ConceptStatus.MISSING }, practiceExercises: { none: {} } })).map(({ slug }) => ({ slug, href: `/concepts/${slug}` }));
  if (task === "concepts-without-references") return (await conceptCandidates({ status: { not: ConceptStatus.MISSING }, references: { none: {} } })).map(({ slug }) => ({ slug, href: `/concepts/${slug}` }));
  if (task === "concepts-without-examples") {
    const concepts = await prisma.concept.findMany({ where: { status: { not: ConceptStatus.MISSING } }, select: { bodyMarkdown: true, slug: true } });
    return concepts.filter((concept) => !hasExamplesSection(concept.bodyMarkdown)).map(({ slug }) => ({ slug, href: `/concepts/${slug}` }));
  }
  if (task === "unreviewed-problems") return (await problemCandidates({ qualityStatus: QualityStatus.UNREVIEWED })).map(({ slug }) => ({ slug, href: `/problems/${slug}` }));
  if (task === "needs-work-problems") return (await problemCandidates({ qualityStatus: QualityStatus.NEEDS_WORK })).map(({ slug }) => ({ slug, href: `/problems/${slug}` }));

  const isProblemTask = task.startsWith("problems-");
  const targetLanguage = task.endsWith("-fr") ? "fr" : "en";
  const pages = isProblemTask
    ? await prisma.problem.findMany({ where: { listed: true, status: ProblemStatus.PUBLISHED }, select: { language: true, slug: true, translationGroupId: true } })
    : await prisma.concept.findMany({ where: { status: { not: ConceptStatus.MISSING } }, select: { language: true, slug: true, translationGroupId: true } });
  return translationSourcesMissingLanguage(pages, targetLanguage).map(({ slug }) => ({
    slug,
    href: `/${isProblemTask ? "problems" : "concepts"}/${slug}/translate?language=${targetLanguage}`
  }));
}

export async function GET(request: NextRequest) {
  const task = parseContributionTaskKey(request.nextUrl.searchParams.get("task"));
  if (!task) return NextResponse.redirect(new URL("/contributing/tasks", request.url));

  const candidates = await candidatesForTask(task);
  if (!candidates.length) return NextResponse.redirect(new URL("/contributing/tasks", request.url));

  const cookieName = `mw_contribution_${task}`;
  const previousSlug = request.cookies.get(cookieName)?.value;
  const candidate = pickRandomDifferent(candidates, candidates.find((item) => item.slug === previousSlug));
  if (!candidate) return NextResponse.redirect(new URL("/contributing/tasks", request.url));

  const response = NextResponse.redirect(new URL(candidate.href, request.url));
  response.cookies.set(cookieName, candidate.slug, { httpOnly: true, maxAge: 60 * 60 * 24 * 30, path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  return response;
}
