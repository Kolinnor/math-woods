import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseAliases } from "@/lib/concept-aliases";

export { parseAliases } from "@/lib/concept-aliases";

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
  const redirectConflict = await tx.conceptRedirect.findFirst({
    where: {
      targetConceptId: { not: conceptId },
      sourceSlug: { in: filteredAliases.map((alias) => alias.aliasSlug) }
    },
    select: { sourceTitle: true }
  });
  if (redirectConflict) {
    throw new Error(`An alias conflicts with the merged concept "${redirectConflict.sourceTitle}".`);
  }
  const aliasConflict = await tx.conceptAlias.findFirst({
    where: {
      conceptId: { not: conceptId },
      aliasSlug: { in: filteredAliases.map((alias) => alias.aliasSlug) }
    },
    select: {
      alias: true,
      concept: { select: { title: true } }
    }
  });
  if (aliasConflict) {
    throw new Error(
      `The alias "${aliasConflict.alias}" is already used by the concept "${aliasConflict.concept.title}".`
    );
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
