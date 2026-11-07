import { ConceptStatus, ProblemStatus } from "@prisma/client";
import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

const SITE_URL = "https://mathwoods.org";

export const dynamic = "force-dynamic";

function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [problems, concepts, mathematicians, milestones, references] = await Promise.all([
    prisma.problem.findMany({
      where: { listed: true, status: ProblemStatus.PUBLISHED },
      select: { slug: true, updatedAt: true }
    }),
    prisma.concept.findMany({
      where: {
        canAppearInConceptBrowser: true,
        status: { not: ConceptStatus.MISSING }
      },
      select: { slug: true, updatedAt: true }
    }),
    prisma.mathematician.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.historyMilestone.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    prisma.libraryReference.findMany({ where: { status: "PUBLISHED", searchable: true, mergedIntoId: null }, select: { slug: true, updatedAt: true } })
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/problems"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/concepts"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/contest"), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/users"), changeFrequency: "weekly", priority: 0.5 },
    { url: absoluteUrl("/recent-changes"), changeFrequency: "daily", priority: 0.5 },
    { url: absoluteUrl("/contributing/tasks"), changeFrequency: "daily", priority: 0.5 },
    { url: absoluteUrl("/about"), changeFrequency: "monthly", priority: 0.4 },
    { url: absoluteUrl("/contributing"), changeFrequency: "monthly", priority: 0.4 },
    { url: absoluteUrl("/legal"), changeFrequency: "yearly", priority: 0.2 }
  ];

  return [
    ...staticPages,
    ...["/library", "/library/history", "/library/mathematicians", "/library/references"].map(path => ({ url: absoluteUrl(path), changeFrequency: "weekly" as const, priority: 0.7 })),
    ...[{ section: "mathematicians", entries: mathematicians }, { section: "history", entries: milestones }, { section: "references", entries: references }].flatMap(({ section, entries }) =>
      entries.map(entry => ({ url: absoluteUrl(`/library/${section}/${entry.slug}`), lastModified: entry.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 }))),
    ...problems.map((problem) => ({
      url: absoluteUrl(`/problems/${problem.slug}`),
      lastModified: problem.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    })),
    ...concepts.map((concept) => ({
      url: absoluteUrl(`/concepts/${concept.slug}`),
      lastModified: concept.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8
    }))
  ];
}
