"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import {
  knownProblemSourceNames,
  normalizeKnownProblemSourceIconUrl,
  normalizeKnownProblemSourceName,
  parseKnownProblemSourceAliases
} from "@/lib/known-problem-sources";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";

async function uniqueKnownSourceSlug(name: string, ignoredId?: number) {
  const base = ensureSlug(name, "source");
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await prisma.knownProblemSource.findUnique({ where: { slug }, select: { id: true } });
    if (!existing || existing.id === ignoredId) return slug;
  }
  throw new Error("Could not create a unique source identifier.");
}

async function findKnownSourceConflict(name: string, aliases: string[], ignoredId?: number) {
  const requestedNames = new Set([name, ...aliases].map(normalizeKnownProblemSourceName));
  const existingSources = await prisma.knownProblemSource.findMany({
    where: ignoredId ? { id: { not: ignoredId } } : undefined,
    select: { name: true, aliases: true, slug: true }
  });
  return existingSources.find((source) =>
    knownProblemSourceNames(source).some((candidate) => requestedNames.has(normalizeKnownProblemSourceName(candidate)))
  ) ?? null;
}

function knownSourceConflictUrl(slug: string, iconUrl: string | null) {
  const query = new URLSearchParams({ duplicate: slug });
  if (iconUrl) query.set("pendingIcon", iconUrl);
  return `/moderation/problem-sources?${query.toString()}#source-${encodeURIComponent(slug)}`;
}

async function attachExactOriginMatches(sourceId: number) {
  const source = await prisma.knownProblemSource.findUnique({
    where: { id: sourceId },
    select: { id: true, name: true, aliases: true }
  });
  if (!source) return 0;

  const normalizedNames = new Set(knownProblemSourceNames(source).map(normalizeKnownProblemSourceName));
  const candidates = await prisma.problem.findMany({
    where: { knownSourceId: null },
    select: { id: true, origin: true, translationGroupId: true }
  });
  const matchingGroups = [...new Set(candidates
    .filter((problem) => normalizedNames.has(normalizeKnownProblemSourceName(problem.origin)))
    .map((problem) => problem.translationGroupId))];
  if (!matchingGroups.length) return 0;

  const result = await prisma.problem.updateMany({
    where: {
      translationGroupId: { in: matchingGroups },
      knownSourceId: null
    },
    data: { knownSourceId: source.id }
  });
  return result.count;
}

function sourceFormValues(formData: FormData) {
  const name = requiredBoundedText(formData.get("name"), CONTENT_LIMITS.title, "Source name");
  const aliases = parseKnownProblemSourceAliases(formData.get("aliases"))
    .filter((alias) => normalizeKnownProblemSourceName(alias) !== normalizeKnownProblemSourceName(name));
  const iconUrl = normalizeKnownProblemSourceIconUrl(formData.get("iconUrl"));
  return { name, aliases, iconUrl };
}

function revalidateKnownSources() {
  revalidatePath("/moderation/problem-sources");
  revalidatePath("/problems/[slug]", "page");
  revalidatePath("/problems/[slug]/edit", "page");
  revalidatePath("/problems/new");
}

export async function createKnownProblemSourceAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertRateLimit(`known-problem-source:create:${admin.id}`, 12, 60_000);
  const values = sourceFormValues(formData);
  const conflictingSource = await findKnownSourceConflict(values.name, values.aliases);
  if (conflictingSource) redirect(knownSourceConflictUrl(conflictingSource.slug, values.iconUrl) as Route);
  const source = await prisma.knownProblemSource.create({
    data: {
      ...values,
      slug: await uniqueKnownSourceSlug(values.name)
    }
  });
  const attached = await attachExactOriginMatches(source.id);
  revalidateKnownSources();
  redirect(`/moderation/problem-sources?created=1&attached=${attached}`);
}

export async function updateKnownProblemSourceAction(sourceId: number, formData: FormData) {
  const admin = await requireAdmin();
  await assertRateLimit(`known-problem-source:update:${admin.id}`, 30, 60_000);
  const previous = await prisma.knownProblemSource.findUnique({ where: { id: sourceId } });
  if (!previous) throw new Error("Known problem source not found.");

  const values = sourceFormValues(formData);
  const conflictingSource = await findKnownSourceConflict(values.name, values.aliases, sourceId);
  if (conflictingSource) redirect(knownSourceConflictUrl(conflictingSource.slug, values.iconUrl) as Route);
  await prisma.knownProblemSource.update({
    where: { id: sourceId },
    data: {
      ...values,
      slug: values.name === previous.name ? previous.slug : await uniqueKnownSourceSlug(values.name, sourceId),
      active: formData.get("active") === "on"
    }
  });
  const attached = await attachExactOriginMatches(sourceId);
  revalidateKnownSources();
  redirect(`/moderation/problem-sources?updated=1&attached=${attached}`);
}
