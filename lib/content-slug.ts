import type { Prisma } from "@prisma/client";
import { ensureSlug } from "@/lib/slug";
import { acquireTransactionLock } from "@/lib/transaction-lock";

type ContentType = "concept" | "problem";

// Call inside the write transaction, after any content/family locks. Creation,
// renaming and alias edits share this lock so an old URL cannot be reassigned.
export async function availableContentSlug(
  tx: Prisma.TransactionClient, type: ContentType, title: string,
  ownerId?: number, preferredSuffix?: string
) {
  await acquireTransactionLock(tx, `content-slugs:${type}`);
  const base = ensureSlug(title);
  const preferred = preferredSuffix ? ensureSlug(preferredSuffix, "") : "";
  let slug = base;
  let suffix = 2;
  for (;;) {
    const occupied = type === "concept"
      ? await tx.concept.findFirst({ where: { slug, ...(ownerId ? { id: { not: ownerId } } : {}) }, select: { id: true } })
        || await tx.conceptAlias.findFirst({ where: { aliasSlug: slug, ...(ownerId ? { conceptId: { not: ownerId } } : {}) }, select: { id: true } })
        || await tx.conceptRedirect.findFirst({ where: { sourceSlug: slug, ...(ownerId ? { OR: [{ targetConceptId: { not: ownerId } }, { isRename: false }] } : {}) }, select: { id: true } })
      : await tx.problem.findFirst({ where: { slug, ...(ownerId ? { id: { not: ownerId } } : {}) }, select: { id: true } })
        || await tx.problemRedirect.findFirst({ where: { sourceSlug: slug, ...(ownerId ? { targetProblemId: { not: ownerId } } : {}) }, select: { id: true } });
    if (!occupied) return slug;
    slug = preferred && slug === base ? `${base}-${preferred}` : `${base}${preferred ? `-${preferred}` : ""}-${suffix++}`;
  }
}

export async function renamedContentSlug(
  tx: Prisma.TransactionClient, type: ContentType,
  current: { id: number; slug: string; title: string; language: string; translationGroupId: string },
  title: string, actorId: number
) {
  // Keep collision suffixes on typographical changes and leave unrelated edits alone.
  if (title === current.title || ensureSlug(title) === ensureSlug(current.title)) return current.slug;
  const slug = await availableContentSlug(tx, type, title, current.id);
  if (slug === current.slug) return slug;
  if (type === "concept") {
    await tx.conceptRedirect.deleteMany({ where: { sourceSlug: slug, targetConceptId: current.id, isRename: true } });
    await tx.conceptRedirect.upsert({
      where: { sourceSlug: current.slug },
      create: {
        sourceSlug: current.slug, sourceConceptId: current.id, sourceTitle: current.title,
        sourceLanguage: current.language, sourceTranslationGroupId: current.translationGroupId,
        targetConceptId: current.id, createdById: actorId, isRename: true
      },
      update: { targetConceptId: current.id }
    });
    // Backlinks use slugs. Collapse only truly duplicate rows before moving them.
    await tx.$executeRaw`
      DELETE FROM "InternalLink" old USING "InternalLink" canonical
      WHERE old."targetSlug" = ${current.slug} AND canonical."targetSlug" = ${slug}
        AND old."sourceType" = canonical."sourceType" AND old."sourceId" = canonical."sourceId"
        AND old.label IS NOT DISTINCT FROM canonical.label
    `;
    await tx.internalLink.updateMany({ where: { targetSlug: current.slug }, data: { targetSlug: slug } });
  } else {
    await tx.problemRedirect.deleteMany({ where: { sourceSlug: slug, targetProblemId: current.id } });
    await tx.problemRedirect.upsert({
      where: { sourceSlug: current.slug },
      create: { sourceSlug: current.slug, targetProblemId: current.id },
      update: { targetProblemId: current.id }
    });
  }
  return slug;
}
