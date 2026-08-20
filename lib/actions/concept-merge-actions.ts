"use server";

import {
  ConceptMergeKind,
  ConceptMergeStatus,
  ConceptStatus,
  Prisma,
  SourceType,
  TargetType
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { orderedUniqueIds, overlappingConceptLanguages } from "@/lib/concept-merge";
import { MAX_CONCEPT_EXERCISES } from "@/lib/concept-exercises";
import { CONTENT_LIMITS, boundedText, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { refreshLinksForConceptId, syncInternalLinks } from "@/lib/internal-links";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { acquireTransactionLock } from "@/lib/transaction-lock";

type MergeTx = Prisma.TransactionClient;

const mergeConceptInclude = {
  aliases: true,
  references: { orderBy: { position: "asc" as const } },
  practiceExercises: { orderBy: { position: "asc" as const } },
  quoteLinks: { select: { quoteId: true } },
  mergeContributors: true
} satisfies Prisma.ConceptInclude;

async function lockConceptGroups(tx: MergeTx, firstGroupId: string, secondGroupId: string) {
  const groupIds = [...new Set([firstGroupId, secondGroupId])].sort();
  for (const groupId of groupIds) {
    await acquireTransactionLock(tx, `concept-family:${groupId}`);
  }
}

async function latestConceptRevisionId(tx: MergeTx, conceptId: number) {
  return (await tx.pageRevision.findFirst({
    where: { pageType: SourceType.CONCEPT, pageId: conceptId },
    orderBy: { id: "desc" },
    select: { id: true }
  }))?.id ?? null;
}

async function normalizeConceptGroupRoot(tx: MergeTx, translationGroupId: string) {
  const concepts = await tx.concept.findMany({
    where: { translationGroupId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, translatedFromConceptId: true }
  });
  if (concepts.length === 0) return null;

  const root = concepts.find(({ translatedFromConceptId }) => translatedFromConceptId === null) ?? concepts[0];
  const rootRevisionId = await latestConceptRevisionId(tx, root.id);
  await tx.concept.update({
    where: { id: root.id },
    data: { translatedFromConceptId: null, translatedFromRevisionId: null }
  });
  await tx.concept.updateMany({
    where: { translationGroupId, id: { not: root.id } },
    data: { translatedFromConceptId: root.id, translatedFromRevisionId: rootRevisionId }
  });
  return root.id;
}

async function linkConceptGroups(
  tx: MergeTx,
  firstGroupId: string,
  secondGroupId: string,
  canonicalConceptId: number,
  editorId: number,
  summary: string
) {
  if (firstGroupId === secondGroupId) return;
  const concepts = await tx.concept.findMany({
    where: { translationGroupId: { in: [firstGroupId, secondGroupId] } },
    include: { practiceExercises: { orderBy: { position: "asc" } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const canonical = concepts.find(({ id }) => id === canonicalConceptId);
  if (!canonical) throw new Error("The canonical concept no longer belongs to either family.");

  const first = concepts.filter(({ translationGroupId }) => translationGroupId === firstGroupId);
  const second = concepts.filter(({ translationGroupId }) => translationGroupId === secondGroupId);
  const overlap = overlappingConceptLanguages(first, second);
  if (overlap.length > 0) throw new Error(`The concept families still overlap in: ${overlap.join(", ")}.`);

  const canonicalGroupId = canonical.translationGroupId;
  const secondaryGroupId = canonicalGroupId === firstGroupId ? secondGroupId : firstGroupId;
  const canonicalRootId = concepts.find((concept) =>
    concept.translationGroupId === canonicalGroupId && concept.translatedFromConceptId === null
  )?.id ?? canonical.id;
  await tx.concept.updateMany({
    where: { translationGroupId: secondaryGroupId },
    data: { translationGroupId: canonicalGroupId }
  });

  const combined = await tx.concept.findMany({
    where: { translationGroupId: canonicalGroupId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const root = combined.find(({ id }) => id === canonicalRootId) ?? canonical;
  const rootRevisionId = await latestConceptRevisionId(tx, root.id);
  const exerciseIds = orderedUniqueIds(
    ...concepts.map(({ practiceExercises }) => practiceExercises.map(({ problemId }) => problemId))
  ).slice(0, MAX_CONCEPT_EXERCISES);

  for (const concept of combined) {
    await tx.concept.update({
      where: { id: concept.id },
      data: {
        domain: canonical.domain,
        domainCode: canonical.domainCode,
        kind: canonical.kind,
        canAppearInConceptBrowser: canonical.canAppearInConceptBrowser,
        translatedFromConceptId: concept.id === root.id ? null : root.id,
        translatedFromRevisionId: concept.id === root.id ? null : rootRevisionId,
        lastEditedById: editorId
      }
    });
    await tx.conceptExercise.deleteMany({ where: { conceptId: concept.id } });
    if (exerciseIds.length > 0) {
      await tx.conceptExercise.createMany({
        data: exerciseIds.map((problemId, position) => ({ conceptId: concept.id, problemId, position }))
      });
    }
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: concept.id,
        markdown: concept.bodyMarkdown,
        conceptTitle: concept.title,
        conceptKind: canonical.kind,
        editedById: editorId,
        editSummary: summary
      }
    });
  }
  for (const concept of combined) await refreshLinksForConceptId(concept.id, tx);
}

async function createCollisionProposals(
  tx: MergeTx,
  sourceGroupId: string,
  targetGroupId: string,
  proposedById: number
) {
  const [sourceConcepts, targetConcepts] = await Promise.all([
    tx.concept.findMany({ where: { translationGroupId: sourceGroupId } }),
    tx.concept.findMany({ where: { translationGroupId: targetGroupId } })
  ]);
  const overlap = overlappingConceptLanguages(sourceConcepts, targetConcepts);
  for (const language of overlap) {
    const source = sourceConcepts.find((concept) => concept.language === language);
    const target = targetConcepts.find((concept) => concept.language === language);
    if (!source || !target) continue;
    const pending = await tx.conceptMergeProposal.findFirst({
      where: {
        status: ConceptMergeStatus.PENDING,
        OR: [
          { sourceConceptId: source.id, targetConceptId: target.id },
          { sourceConceptId: target.id, targetConceptId: source.id }
        ]
      },
      select: { id: true }
    });
    if (pending) continue;
    await tx.conceptMergeProposal.create({
      data: {
        kind: ConceptMergeKind.DUPLICATE,
        sourceConceptId: source.id,
        targetConceptId: target.id,
        sourceSlug: source.slug,
        targetSlug: target.slug,
        sourceTitle: source.title,
        targetTitle: target.title,
        sourceLanguage: source.language,
        targetLanguage: target.language,
        sourceTranslationGroupId: source.translationGroupId,
        targetTranslationGroupId: target.translationGroupId,
        reason: "Automatically detected between overlapping translation families.",
        proposedById
      }
    });
  }
  return overlap;
}

export async function proposeConceptMergeAction(sourceConceptId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept-merge:propose:${user.id}`, 12, 60 * 60_000);
  const targetConceptId = Number(formData.get("targetConceptId"));
  if (!Number.isInteger(targetConceptId) || targetConceptId <= 0 || targetConceptId === sourceConceptId) {
    throw new Error("Choose a different concept page.");
  }
  const reason = boundedText(formData.get("reason"), CONTENT_LIMITS.mediumText, "Reason") || null;
  const [source, target] = await Promise.all([
    prisma.concept.findUnique({ where: { id: sourceConceptId } }),
    prisma.concept.findUnique({ where: { id: targetConceptId } })
  ]);
  if (!source || !target) throw new Error("One of the concept pages no longer exists.");
  if (source.translationGroupId === target.translationGroupId) {
    redirect(`/concepts/${source.slug}/merge?alreadyLinked=1` as never);
  }
  const created = await prisma.$transaction(async (tx) => {
    await lockConceptGroups(tx, source.translationGroupId, target.translationGroupId);
    const [currentSource, currentTarget] = await Promise.all([
      tx.concept.findUnique({ where: { id: source.id } }),
      tx.concept.findUnique({ where: { id: target.id } })
    ]);
    if (!currentSource || !currentTarget) throw new Error("One of the concept pages no longer exists.");
    if (currentSource.translationGroupId === currentTarget.translationGroupId) return false;
    const currentKind = currentSource.language === currentTarget.language
      ? ConceptMergeKind.DUPLICATE
      : ConceptMergeKind.TRANSLATION_LINK;
    const pending = await tx.conceptMergeProposal.findFirst({
      where: {
        status: ConceptMergeStatus.PENDING,
        OR: [
          { sourceConceptId: source.id, targetConceptId: target.id },
          { sourceConceptId: target.id, targetConceptId: source.id }
        ]
      },
      select: { id: true }
    });
    if (pending) return true;
    await tx.conceptMergeProposal.create({
      data: {
        kind: currentKind,
        sourceConceptId: currentSource.id,
        targetConceptId: currentTarget.id,
        sourceSlug: currentSource.slug,
        targetSlug: currentTarget.slug,
        sourceTitle: currentSource.title,
        targetTitle: currentTarget.title,
        sourceLanguage: currentSource.language,
        targetLanguage: currentTarget.language,
        sourceTranslationGroupId: currentSource.translationGroupId,
        targetTranslationGroupId: currentTarget.translationGroupId,
        reason,
        proposedById: user.id
      }
    });
    if (currentKind === ConceptMergeKind.TRANSLATION_LINK) {
      await createCollisionProposals(tx, currentSource.translationGroupId, currentTarget.translationGroupId, user.id);
    }
    return true;
  });
  if (!created) redirect(`/concepts/${source.slug}/merge?alreadyLinked=1` as never);

  revalidatePath("/moderation");
  redirect(`/concepts/${source.slug}/merge?proposed=1` as never);
}

export async function rejectConceptMergeProposalAction(proposalId: number) {
  const admin = await requireAdmin();
  await assertRateLimit(`concept-merge:review:${admin.id}`, 30, 60 * 60_000);
  await prisma.conceptMergeProposal.updateMany({
    where: { id: proposalId, status: ConceptMergeStatus.PENDING },
    data: {
      status: ConceptMergeStatus.REJECTED,
      reviewedById: admin.id,
      reviewedAt: new Date()
    }
  });
  revalidatePath("/moderation");
  revalidatePath(`/moderation/concept-merges/${proposalId}`);
}

export async function linkConceptTranslationGroupsAction(proposalId: number, canonicalConceptId: number) {
  const admin = await requireAdmin();
  await assertRateLimit(`concept-merge:review:${admin.id}`, 30, 60 * 60_000);
  const result = await prisma.$transaction(async (tx) => {
    const proposal = await tx.conceptMergeProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.status !== ConceptMergeStatus.PENDING) return null;
    if (proposal.kind !== ConceptMergeKind.TRANSLATION_LINK) throw new Error("This proposal is not a translation link.");
    await lockConceptGroups(tx, proposal.sourceTranslationGroupId, proposal.targetTranslationGroupId);
    const [source, target] = await Promise.all([
      tx.concept.findUnique({ where: { id: proposal.sourceConceptId } }),
      tx.concept.findUnique({ where: { id: proposal.targetConceptId } })
    ]);
    if (!source || !target) {
      await tx.conceptMergeProposal.update({
        where: { id: proposal.id },
        data: { status: ConceptMergeStatus.INVALIDATED, reviewedById: admin.id, reviewedAt: new Date() }
      });
      return null;
    }
    if (![source.id, target.id].includes(canonicalConceptId)) throw new Error("Invalid canonical concept.");
    if (source.translationGroupId === target.translationGroupId) {
      await tx.conceptMergeProposal.update({
        where: { id: proposal.id },
        data: {
          status: ConceptMergeStatus.COMPLETED,
          reviewedById: admin.id,
          reviewedAt: new Date(),
          resultConceptId: canonicalConceptId
        }
      });
      return { sourceSlug: source.slug, targetSlug: target.slug };
    }
    if (
      source.translationGroupId !== proposal.sourceTranslationGroupId
      || target.translationGroupId !== proposal.targetTranslationGroupId
    ) {
      await tx.conceptMergeProposal.update({
        where: { id: proposal.id },
        data: { status: ConceptMergeStatus.INVALIDATED, reviewedById: admin.id, reviewedAt: new Date() }
      });
      return null;
    }
    await linkConceptGroups(
      tx,
      source.translationGroupId,
      target.translationGroupId,
      canonicalConceptId,
      admin.id,
      "Independent concept families linked as translations"
    );
    await tx.conceptMergeProposal.update({
      where: { id: proposal.id },
      data: {
        status: ConceptMergeStatus.COMPLETED,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        resultConceptId: canonicalConceptId
      }
    });
    return { sourceSlug: source.slug, targetSlug: target.slug };
  });

  revalidatePath("/");
  revalidatePath("/concepts");
  revalidatePath("/moderation");
  if (result) {
    revalidatePath(`/concepts/${result.sourceSlug}`);
    revalidatePath(`/concepts/${result.targetSlug}`);
  }
  redirect(`/moderation/concept-merges/${proposalId}?completed=1` as never);
}

export async function mergeDuplicateConceptsAction(proposalId: number, survivorConceptId: number, formData: FormData) {
  const admin = await requireAdmin();
  await assertRateLimit(`concept-merge:review:${admin.id}`, 20, 60 * 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Content");
  const { renderMarkdown } = await import("@/lib/markdown");
  const bodyHtml = await renderMarkdown(bodyMarkdown);

  const result = await prisma.$transaction(async (tx) => {
    const proposal = await tx.conceptMergeProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.status !== ConceptMergeStatus.PENDING) return null;
    if (proposal.kind !== ConceptMergeKind.DUPLICATE) throw new Error("This proposal is not a same-language duplicate.");
    await lockConceptGroups(tx, proposal.sourceTranslationGroupId, proposal.targetTranslationGroupId);
    const [first, second] = await Promise.all([
      tx.concept.findUnique({ where: { id: proposal.sourceConceptId }, include: mergeConceptInclude }),
      tx.concept.findUnique({ where: { id: proposal.targetConceptId }, include: mergeConceptInclude })
    ]);
    if (!first || !second) {
      await tx.conceptMergeProposal.update({
        where: { id: proposal.id },
        data: { status: ConceptMergeStatus.INVALIDATED, reviewedById: admin.id, reviewedAt: new Date() }
      });
      return null;
    }
    if (first.language !== second.language) throw new Error("Only pages in the same language can be merged.");
    if (![first.id, second.id].includes(survivorConceptId)) throw new Error("Invalid surviving concept.");
    if (
      first.translationGroupId !== proposal.sourceTranslationGroupId
      || second.translationGroupId !== proposal.targetTranslationGroupId
    ) {
      await tx.conceptMergeProposal.update({
        where: { id: proposal.id },
        data: { status: ConceptMergeStatus.INVALIDATED, reviewedById: admin.id, reviewedAt: new Date() }
      });
      return null;
    }
    const survivor = first.id === survivorConceptId ? first : second;
    const duplicate = survivor.id === first.id ? second : first;

    const titleConflict = await tx.concept.findFirst({
      where: {
        id: { notIn: [survivor.id, duplicate.id] },
        language: survivor.language,
        title: { equals: title, mode: "insensitive" }
      },
      select: { id: true }
    });
    if (titleConflict) throw new Error("Another concept already uses this title in the same language.");

    const aliasCandidates = new Map<string, string>();
    for (const alias of [...survivor.aliases, ...duplicate.aliases]) aliasCandidates.set(alias.aliasSlug, alias.alias);
    const duplicateTitleSlug = ensureSlug(duplicate.title, "");
    if (duplicateTitleSlug) aliasCandidates.set(duplicateTitleSlug, duplicate.title);
    aliasCandidates.delete(survivor.slug);
    const canonicalAliasConflicts = await tx.concept.findMany({
      where: {
        id: { notIn: [survivor.id, duplicate.id] },
        slug: { in: [...aliasCandidates.keys()] }
      },
      select: { slug: true }
    });
    for (const conflict of canonicalAliasConflicts) aliasCandidates.delete(conflict.slug);

    const references = new Map<string, { title: string; url: string | null; note: string | null }>();
    for (const reference of [...survivor.references, ...duplicate.references]) {
      const key = `${reference.url?.trim().toLocaleLowerCase() ?? ""}|${reference.title.trim().toLocaleLowerCase()}|${reference.note?.trim().toLocaleLowerCase() ?? ""}`;
      if (!references.has(key)) references.set(key, { title: reference.title, url: reference.url, note: reference.note });
    }
    const exerciseIds = orderedUniqueIds(
      survivor.practiceExercises.map(({ problemId }) => problemId),
      duplicate.practiceExercises.map(({ problemId }) => problemId)
    ).slice(0, MAX_CONCEPT_EXERCISES);

    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: duplicate.id,
        markdown: duplicate.bodyMarkdown,
        conceptTitle: duplicate.title,
        conceptKind: duplicate.kind,
        editedById: admin.id,
        editSummary: `Concept merged into ${survivor.title}`
      }
    });
    await Promise.all([
      tx.conceptTalkPost.updateMany({ where: { conceptId: duplicate.id }, data: { conceptId: survivor.id } }),
      tx.playlistNode.updateMany({ where: { conceptId: duplicate.id }, data: { conceptId: survivor.id } }),
      tx.explorationBlock.updateMany({ where: { conceptId: duplicate.id }, data: { conceptId: survivor.id } }),
      tx.dailyConceptReview.updateMany({ where: { conceptId: duplicate.id }, data: { conceptId: survivor.id } }),
      tx.report.updateMany({
        where: { targetType: TargetType.CONCEPT, targetId: duplicate.id },
        data: { targetId: survivor.id }
      }),
      tx.concept.updateMany({
        where: { translatedFromConceptId: duplicate.id },
        data: { translatedFromConceptId: survivor.id, translatedFromRevisionId: null }
      }),
      tx.conceptRedirect.updateMany({
        where: { targetConceptId: duplicate.id },
        data: { targetConceptId: survivor.id }
      }),
      tx.conceptMergeProposal.updateMany({
        where: { resultConceptId: duplicate.id },
        data: { resultConceptId: survivor.id }
      }),
      tx.conceptMergeProposal.updateMany({
        where: {
          id: { not: proposal.id },
          status: ConceptMergeStatus.PENDING,
          OR: [{ sourceConceptId: duplicate.id }, { targetConceptId: duplicate.id }]
        },
        data: {
          status: ConceptMergeStatus.INVALIDATED,
          reviewedById: admin.id,
          reviewedAt: new Date()
        }
      })
    ]);
    if (duplicate.quoteLinks.length > 0) {
      await tx.quoteConcept.createMany({
        data: duplicate.quoteLinks.map(({ quoteId }) => ({ quoteId, conceptId: survivor.id })),
        skipDuplicates: true
      });
    }
    const creditsByUser = new Map<number, {
      conceptId: number;
      userId: number;
      sourceConceptId: number;
      creditedAt: Date;
    }>();
    for (const credit of [
      ...survivor.mergeContributors,
      ...duplicate.mergeContributors,
      ...(duplicate.createdById ? [{
        userId: duplicate.createdById,
        sourceConceptId: duplicate.id,
        creditedAt: duplicate.createdAt
      }] : [])
    ]) {
      const existing = creditsByUser.get(credit.userId);
      if (!existing || credit.creditedAt < existing.creditedAt) {
        creditsByUser.set(credit.userId, { conceptId: survivor.id, ...credit });
      }
    }
    await tx.conceptMergeContributor.deleteMany({ where: { conceptId: survivor.id } });
    if (creditsByUser.size > 0) {
      await tx.conceptMergeContributor.createMany({ data: [...creditsByUser.values()] });
    }

    await tx.conceptAlias.deleteMany({ where: { conceptId: survivor.id } });
    await tx.conceptReference.deleteMany({ where: { conceptId: survivor.id } });
    await tx.conceptExercise.deleteMany({ where: { conceptId: survivor.id } });
    await tx.internalLink.deleteMany({ where: { sourceType: SourceType.CONCEPT, sourceId: duplicate.id } });
    await tx.internalLink.updateMany({
      where: { targetSlug: duplicate.slug },
      data: { targetSlug: survivor.slug, targetType: TargetType.CONCEPT, exists: true }
    });
    await tx.concept.update({
      where: { id: survivor.id },
      data: {
        title,
        bodyMarkdown,
        bodyHtml,
        canAppearInConceptBrowser: survivor.canAppearInConceptBrowser || duplicate.canAppearInConceptBrowser,
        needsReviewAfterEdit: true,
        status: survivor.status === ConceptStatus.STUB
          && duplicate.status !== ConceptStatus.MISSING
          && duplicate.status !== ConceptStatus.STUB
          ? ConceptStatus.USABLE
          : survivor.status,
        lastEditedById: admin.id
      }
    });
    await tx.concept.delete({ where: { id: duplicate.id } });
    await tx.conceptRedirect.create({
      data: {
        sourceSlug: duplicate.slug,
        sourceConceptId: duplicate.id,
        sourceTitle: duplicate.title,
        sourceLanguage: duplicate.language,
        sourceTranslationGroupId: duplicate.translationGroupId,
        targetConceptId: survivor.id,
        createdById: admin.id
      }
    });
    if (aliasCandidates.size > 0) {
      await tx.conceptAlias.createMany({
        data: [...aliasCandidates].map(([aliasSlug, alias]) => ({ conceptId: survivor.id, alias, aliasSlug })),
        skipDuplicates: true
      });
    }
    if (references.size > 0) {
      await tx.conceptReference.createMany({
        data: [...references.values()].map((reference, position) => ({ conceptId: survivor.id, ...reference, position }))
      });
    }
    if (exerciseIds.length > 0) {
      await tx.conceptExercise.createMany({
        data: exerciseIds.map((problemId, position) => ({ conceptId: survivor.id, problemId, position }))
      });
    }
    await syncInternalLinks(SourceType.CONCEPT, survivor.id, bodyMarkdown, tx, survivor.language);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: survivor.id,
        markdown: bodyMarkdown,
        conceptTitle: title,
        conceptKind: survivor.kind,
        editedById: admin.id,
        editSummary: `Merged duplicate concept ${duplicate.title}`
      }
    });

    const [remainingSourceGroup, targetGroup] = await Promise.all([
      tx.concept.findMany({ where: { translationGroupId: duplicate.translationGroupId }, select: { id: true, language: true } }),
      tx.concept.findMany({ where: { translationGroupId: survivor.translationGroupId }, select: { id: true, language: true } })
    ]);
    const remainingOverlap = overlappingConceptLanguages(remainingSourceGroup, targetGroup);
    if (remainingSourceGroup.length > 0 && remainingOverlap.length === 0) {
      await linkConceptGroups(
        tx,
        duplicate.translationGroupId,
        survivor.translationGroupId,
        survivor.id,
        admin.id,
        "Translation families joined after duplicate merge"
      );
    } else if (remainingSourceGroup.length > 0) {
      await normalizeConceptGroupRoot(tx, duplicate.translationGroupId);
      await normalizeConceptGroupRoot(tx, survivor.translationGroupId);
      await createCollisionProposals(tx, duplicate.translationGroupId, survivor.translationGroupId, admin.id);
    }
    await refreshLinksForConceptId(survivor.id, tx);
    await tx.conceptMergeProposal.update({
      where: { id: proposal.id },
      data: {
        status: ConceptMergeStatus.COMPLETED,
        reviewedById: admin.id,
        reviewedAt: new Date(),
        resultConceptId: survivor.id
      }
    });
    return { survivorSlug: survivor.slug, duplicateSlug: duplicate.slug };
  });

  revalidatePath("/");
  revalidatePath("/concepts");
  revalidatePath("/moderation");
  if (!result) redirect(`/moderation/concept-merges/${proposalId}?invalidated=1` as never);
  revalidatePath(`/concepts/${result.survivorSlug}`);
  revalidatePath(`/concepts/${result.duplicateSlug}`);
  redirect(`/concepts/${result.survivorSlug}`);
}
