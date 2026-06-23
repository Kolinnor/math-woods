import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureSlug } from "@/lib/slug";

export function parseAliases(input: FormDataEntryValue | null) {
  const aliases = String(input ?? "")
    .split(/[,\n]/)
    .map((alias) => alias.trim())
    .filter(Boolean);

  return Array.from(new Map(aliases.map((alias) => [ensureSlug(alias), alias])).entries())
    .filter(([aliasSlug]) => Boolean(aliasSlug))
    .map(([aliasSlug, alias]) => ({ aliasSlug, alias }));
}

export function parseReferences(input: FormDataEntryValue | null) {
  return String(input ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [titleRaw, urlRaw, noteRaw] = line.split("|", 3).map((part) => part?.trim() ?? "");
      const url = urlRaw && /^https?:\/\//i.test(urlRaw) ? urlRaw : null;

      return {
        title: titleRaw || urlRaw || `Reference ${index + 1}`,
        url,
        note: noteRaw || (!url && urlRaw ? urlRaw : null),
        position: index + 1
      };
    });
}

export async function syncConceptAliases(
  conceptId: number,
  aliases: ReturnType<typeof parseAliases>,
  tx: Prisma.TransactionClient = prisma
) {
  const concept = await tx.concept.findUnique({
    where: { id: conceptId },
    select: { slug: true }
  });
  const filteredAliases = aliases.filter((alias) => alias.aliasSlug !== concept?.slug);
  const canonicalConflict = await tx.concept.findFirst({
    where: {
      id: { not: conceptId },
      slug: { in: filteredAliases.map((alias) => alias.aliasSlug) }
    },
    select: { title: true }
  });

  if (canonicalConflict) {
    throw new Error(`An alias conflicts with the existing concept "${canonicalConflict.title}".`);
  }

  await tx.conceptAlias.deleteMany({ where: { conceptId } });
  if (filteredAliases.length) {
    await tx.conceptAlias.createMany({
      data: filteredAliases.map((alias) => ({ conceptId, ...alias }))
    });
  }
}

export async function syncConceptReferences(
  conceptId: number,
  references: ReturnType<typeof parseReferences>,
  tx: Prisma.TransactionClient = prisma
) {
  await tx.conceptReference.deleteMany({ where: { conceptId } });
  if (references.length) {
    await tx.conceptReference.createMany({
      data: references.map((reference) => ({ conceptId, ...reference }))
    });
  }
}
