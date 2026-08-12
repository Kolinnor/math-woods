"use server";

import type { Route } from "next";
import { ConceptStatus, NotificationType, SourceType, TargetType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkConceptAchievements } from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { parseConceptExerciseIds } from "@/lib/concept-exercises";
import { parseConceptKind } from "@/lib/concept-kinds";
import {
  buildConceptRevisionSnapshot,
  changedConceptSnapshotFields,
  conceptRevisionAutomaticSummary,
  conceptRevisionSnapshotInclude,
  conceptRevisionSnapshotJson,
  type ConceptSnapshotSource
} from "@/lib/concept-revisions";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { assertDailyContentCreationQuota } from "@/lib/content-creation-quota";
import { prisma } from "@/lib/db";
import { completeDailyConceptReviewForUser } from "@/lib/daily-concept-reviews";
import { notifyConceptAuthor, notifyOwnerOfSiteActivity } from "@/lib/notifications";
import { parseAliases, parseReferences, syncConceptAliases, syncConceptReferences } from "@/lib/concept-metadata";
import { coarseDomainForCode, parseDomainCode } from "@/lib/domains";
import { refreshLinksForConcept, refreshLinksForConceptId, syncInternalLinks } from "@/lib/internal-links";
import {
  editableContentLanguage,
  parseTranslationGroupId,
  requireActiveContentLanguage
} from "@/lib/languages";
import {
  canChangeConceptStatus,
  canDeleteConcept,
  canDowngradeConceptStatus,
  canEditConcept,
  canReviewConcept,
  canRollbackConcept,
  canUseAdminTools
} from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { contentLanguageViewHref } from "@/lib/translation-routing";
import { conceptTranslationSharedChanges } from "@/lib/translation-properties";
import { latestConceptTextRevisionIdFromRevisions } from "@/lib/translation-text-revisions";
import { uniqueSlug } from "@/lib/unique-slug";
import { displayNameForUser } from "@/lib/user-display";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

function duplicateConceptTitleError() {
  return new Error("A concept card already exists with this title.");
}

async function pinLatestConceptRevisionMetadata(
  tx: Prisma.TransactionClient,
  concept: ConceptSnapshotSource
) {
  const snapshot = buildConceptRevisionSnapshot(concept);
  const latestRevision = await tx.pageRevision.findFirst({
    where: { pageType: SourceType.CONCEPT, pageId: concept.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, conceptTitle: true, conceptKind: true, conceptSnapshot: true }
  });
  if (
    latestRevision &&
    (latestRevision.conceptTitle === null ||
      latestRevision.conceptKind === null ||
      latestRevision.conceptSnapshot === null)
  ) {
    await tx.pageRevision.update({
      where: { id: latestRevision.id },
      data: {
        ...(latestRevision.conceptTitle === null ? { conceptTitle: concept.title } : {}),
        ...(latestRevision.conceptKind === null ? { conceptKind: concept.kind } : {}),
        ...(latestRevision.conceptSnapshot === null
          ? { conceptSnapshot: conceptRevisionSnapshotJson(snapshot) }
          : {})
      }
    });
  }
}

async function conceptSnapshotSource(tx: Prisma.TransactionClient, conceptId: number) {
  const concept = await tx.concept.findUnique({
    where: { id: conceptId },
    include: conceptRevisionSnapshotInclude
  });
  if (!concept) throw new Error("Concept not found.");
  return concept;
}

export async function createConceptAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:create:${user.id}`, 5, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = requireActiveContentLanguage(formData.get("language"));
  const translationGroupId = parseTranslationGroupId(formData.get("translationGroupId"));
  const translationSourceSlug = ensureSlug(String(formData.get("translationSourceSlug") ?? ""), "");
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Concept content");
  const kind = parseConceptKind(formData.get("kind"));
  const domainCode = parseDomainCode(formData.get("domain"));
  const domain = coarseDomainForCode(domainCode);
  const aliases = parseAliases(boundedText(formData.get("aliases"), CONTENT_LIMITS.mediumText, "Aliases"));
  const references = parseReferences(boundedText(formData.get("references"), CONTENT_LIMITS.longNote, "References"));

  const slug = await uniqueSlug("concept", title);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const concept = await prisma.$transaction(async (tx) => {
    await assertDailyContentCreationQuota(tx, user);
    const existingTitle = await tx.concept.findFirst({
      where: {
        language,
        title: { equals: title, mode: "insensitive" }
      },
      select: { id: true }
    });
    if (existingTitle) throw duplicateConceptTitleError();

    if (translationGroupId) {
      const existingTranslation = await tx.concept.findFirst({
        where: { translationGroupId, language },
        select: { slug: true }
      });
      if (existingTranslation) {
        throw new Error("A concept translation already exists in this language.");
      }
    }
    const translationSource =
      translationGroupId && translationSourceSlug
        ? await tx.concept.findFirst({
            where: { slug: translationSourceSlug, translationGroupId },
            include: conceptRevisionSnapshotInclude
          })
        : null;
    if (translationGroupId && !translationSource) {
      throw new Error("The selected concept translation source does not belong to this translation group.");
    }
    const originalConcept = translationGroupId
      ? await tx.concept.findFirst({
          where: { translationGroupId, translatedFromConceptId: null },
          orderBy: { createdAt: "asc" },
          include: conceptRevisionSnapshotInclude
        })
      : null;
    const sharedConcept = originalConcept ?? translationSource;
    const sourceRevisionId = translationSource
      ? latestConceptTextRevisionIdFromRevisions(await tx.pageRevision.findMany({
          where: { pageType: SourceType.CONCEPT, pageId: translationSource.id },
          orderBy: { id: "asc" },
          select: { id: true, markdown: true, conceptTitle: true, conceptSnapshot: true }
        }))
      : null;

    const created = await tx.concept.create({
      data: {
        slug,
        language,
        ...(translationGroupId ? { translationGroupId } : {}),
        ...(translationSource
          ? {
              translatedFromConceptId: translationSource.id,
              translatedFromRevisionId: sourceRevisionId
            }
          : {}),
        title,
        bodyMarkdown,
        bodyHtml,
        domain: sharedConcept?.domain ?? domain,
        domainCode: sharedConcept?.domainCode ?? domainCode,
        kind: sharedConcept?.kind ?? kind,
        status: ConceptStatus.STUB,
        needsReviewAfterEdit: false,
        canAppearInConceptBrowser: sharedConcept?.canAppearInConceptBrowser ?? false,
        ...(translationGroupId ? { createdAt: sharedConcept?.createdAt } : {}),
        createdById: sharedConcept ? sharedConcept.createdById : user.id,
        lastEditedById: user.id
      }
    });
    await syncInternalLinks(SourceType.CONCEPT, created.id, bodyMarkdown, tx, language);
    await syncConceptAliases(created.id, aliases, tx);
    await syncConceptReferences(
      created.id,
      sharedConcept
        ? sharedConcept.references.map(({ title, url, note, position }) => ({ title, url, note, position }))
        : references,
      tx
    );
    if (sharedConcept?.practiceExercises.length) {
      await tx.conceptExercise.createMany({
        data: sharedConcept.practiceExercises.map(({ problemId, position }) => ({
          conceptId: created.id,
          problemId,
          position
        }))
      });
    }
    await refreshLinksForConceptId(created.id, tx);
    const createdSnapshot = buildConceptRevisionSnapshot(await conceptSnapshotSource(tx, created.id));
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: created.id,
        markdown: bodyMarkdown,
        conceptTitle: created.title,
        conceptKind: created.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(createdSnapshot),
        editedById: user.id,
        isCreation: true,
        editSummary: "Concept created"
      }
    });
    return created;
  });

  await refreshLinksForConcept(concept.slug);
  revalidatePath("/");
  await notifyOwnerOfSiteActivity({
    actor: user,
    type: NotificationType.CONCEPT_CREATED,
    title: "New concept created",
    body: `${displayNameForUser(user)} created "${concept.title}".`,
    href: `/concepts/${concept.slug}`
  });
  await checkConceptAchievements(user.id);
  redirect(contentLanguageViewHref("/concepts", concept.slug, concept.language) as Route);
}

export async function updateConceptAction(conceptId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:update:${user.id}`, 20, 60_000);
  const existingConcept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: {
      createdById: true,
      language: true,
      title: true,
      kind: true,
      translationGroupId: true,
      translatedFromConceptId: true,
      status: true,
      bodyMarkdown: true,
      needsReviewAfterEdit: true
    }
  });
  if (!existingConcept) throw new Error("Concept not found.");
  if (!canEditConcept(user, existingConcept)) {
    throw new Error("You cannot edit this concept.");
  }

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = editableContentLanguage(formData.get("language"), existingConcept.language);
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Concept content");
  const kind = parseConceptKind(formData.get("kind"), existingConcept.kind);
  const domainCode = parseDomainCode(formData.get("domain"));
  const domain = coarseDomainForCode(domainCode);
  const aliases = parseAliases(boundedText(formData.get("aliases"), CONTENT_LIMITS.mediumText, "Aliases"));
  const references = parseReferences(boundedText(formData.get("references"), CONTENT_LIMITS.longNote, "References"));
  const exerciseIds = parseConceptExerciseIds(formData.getAll("exerciseIds"));
  const editSummary = boundedText(formData.get("editSummary"), CONTENT_LIMITS.shortText, "Edit summary");
  const markTranslationFresh = formData.get("markTranslationFresh") === "on";
  const canAppearInConceptBrowser = canUseAdminTools(user)
    ? formData.get("canAppearInConceptBrowser") === "on"
    : undefined;

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  const hasReviewSensitiveChanges =
    title.trim() !== existingConcept.title.trim() || bodyMarkdown !== existingConcept.bodyMarkdown;
  const needsReviewAfterEdit =
    existingConcept.needsReviewAfterEdit ||
    ((existingConcept.status === ConceptStatus.REVIEWED || existingConcept.status === ConceptStatus.EXCELLENT) &&
      hasReviewSensitiveChanges);
  const concept = await prisma.$transaction(async (tx) => {
    const currentSnapshotSource = await conceptSnapshotSource(tx, conceptId);
    await pinLatestConceptRevisionMetadata(tx, currentSnapshotSource);
    const currentSnapshot = buildConceptRevisionSnapshot(currentSnapshotSource);
    const titleOrLanguageChanged =
      title.toLowerCase() !== existingConcept.title.toLowerCase() || language !== existingConcept.language;
    if (titleOrLanguageChanged) {
      const existingTitle = await tx.concept.findFirst({
        where: {
          id: { not: conceptId },
          language,
          title: { equals: title, mode: "insensitive" }
        },
        select: { id: true }
      });
      if (existingTitle) throw duplicateConceptTitleError();
    }
    if (language !== existingConcept.language) {
      const existingTranslation = await tx.concept.findFirst({
        where: {
          id: { not: conceptId },
          translationGroupId: existingConcept.translationGroupId,
          language
        },
        select: { slug: true }
      });
      if (existingTranslation) {
        throw new Error("A concept translation already exists in this language.");
      }
    }

    const refreshedSourceRevisionId =
      markTranslationFresh && existingConcept.translatedFromConceptId
        ? latestConceptTextRevisionIdFromRevisions(await tx.pageRevision.findMany({
            where: { pageType: SourceType.CONCEPT, pageId: existingConcept.translatedFromConceptId },
            orderBy: { id: "asc" },
            select: { id: true, markdown: true, conceptTitle: true, conceptSnapshot: true }
          }))
        : null;

    const updated = await tx.concept.update({
      where: { id: conceptId },
      data: {
        title,
        language,
        bodyMarkdown,
        bodyHtml,
        domain,
        domainCode,
        kind,
        needsReviewAfterEdit,
        ...(canAppearInConceptBrowser !== undefined ? { canAppearInConceptBrowser } : {}),
        ...(refreshedSourceRevisionId ? { translatedFromRevisionId: refreshedSourceRevisionId } : {}),
        lastEditedById: user.id
      }
    });

    await syncInternalLinks(SourceType.CONCEPT, updated.id, bodyMarkdown, tx, language);
    await syncConceptAliases(updated.id, aliases, tx);
    await syncConceptReferences(updated.id, references, tx);
    const validExercises = exerciseIds.length
      ? await tx.problem.findMany({
          where: {
            id: { in: exerciseIds },
            isExercise: true,
            listed: true,
            status: "PUBLISHED"
          },
          select: { id: true }
        })
      : [];
    const validExerciseIds = new Set(validExercises.map((exercise) => exercise.id));
    const orderedExerciseIds = exerciseIds.filter((exerciseId) => validExerciseIds.has(exerciseId));
    await tx.conceptExercise.deleteMany({ where: { conceptId: updated.id } });
    if (orderedExerciseIds.length > 0) {
      await tx.conceptExercise.createMany({
        data: orderedExerciseIds.map((problemId, position) => ({
          conceptId: updated.id,
          problemId,
          position
        }))
      });
    }
    await refreshLinksForConceptId(updated.id, tx);
    const updatedSnapshot = buildConceptRevisionSnapshot(await conceptSnapshotSource(tx, updated.id));
    const changedFields = changedConceptSnapshotFields(currentSnapshot, updatedSnapshot);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: updated.id,
        markdown: bodyMarkdown,
        conceptTitle: updated.title,
        conceptKind: updated.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(updatedSnapshot),
        editedById: user.id,
        editSummary: editSummary || conceptRevisionAutomaticSummary(changedFields)
      }
    });
    await completeDailyConceptReviewForUser(tx, user.id, updated.id);

    const sharedChangedFields = conceptTranslationSharedChanges(changedFields);
    const sharedChangedFieldSet = new Set(sharedChangedFields);
    const siblings = sharedChangedFields.length > 0
      ? (
          await tx.concept.findMany({
            where: { translationGroupId: existingConcept.translationGroupId, id: { not: updated.id } },
            select: { id: true, slug: true }
          })
        )
      : [];
    for (const sibling of siblings) {
      const siblingBefore = await conceptSnapshotSource(tx, sibling.id);
      await pinLatestConceptRevisionMetadata(tx, siblingBefore);
      await tx.concept.update({
        where: { id: sibling.id },
        data: {
          ...(sharedChangedFieldSet.has("domainCode") ? { domain, domainCode } : {}),
          ...(sharedChangedFieldSet.has("kind") ? { kind } : {}),
          ...(sharedChangedFieldSet.has("canAppearInConceptBrowser")
            ? { canAppearInConceptBrowser: updated.canAppearInConceptBrowser }
            : {})
        }
      });
      if (sharedChangedFieldSet.has("practiceExercises")) {
        await tx.conceptExercise.deleteMany({ where: { conceptId: sibling.id } });
        if (orderedExerciseIds.length > 0) {
          await tx.conceptExercise.createMany({
            data: orderedExerciseIds.map((problemId, position) => ({ conceptId: sibling.id, problemId, position }))
          });
        }
      }
      const siblingAfter = await conceptSnapshotSource(tx, sibling.id);
      await tx.pageRevision.create({
        data: {
          pageType: SourceType.CONCEPT,
          pageId: sibling.id,
          markdown: siblingAfter.bodyMarkdown,
          conceptTitle: siblingAfter.title,
          conceptKind: siblingAfter.kind,
          conceptSnapshot: conceptRevisionSnapshotJson(buildConceptRevisionSnapshot(siblingAfter)),
          editedById: user.id,
          editSummary: `Shared settings updated from ${updated.language} translation`
        }
      });
    }

    return { updated, synchronizedTranslationSlugs: siblings.map(({ slug }) => slug) };
  });

  await refreshLinksForConcept(concept.updated.slug);
  revalidatePath("/concepts");
  revalidatePath(`/concepts/${concept.updated.slug}`);
  revalidatePath(`/concepts/${concept.updated.slug}/edit`);
  revalidatePath(`/concepts/${concept.updated.slug}/history`);
  for (const siblingSlug of concept.synchronizedTranslationSlugs) {
    revalidatePath(`/concepts/${siblingSlug}`);
    revalidatePath(`/concepts/${siblingSlug}/edit`);
    revalidatePath(`/concepts/${siblingSlug}/history`);
  }
  await notifyOwnerOfSiteActivity({
    actor: user,
    type: NotificationType.CONCEPT_EDITED,
    title: "Concept edited",
    body: `${displayNameForUser(user)} edited "${concept.updated.title}".`,
    href: `/concepts/${concept.updated.slug}`
  });
  await notifyConceptAuthor({
    conceptId: concept.updated.id,
    actorId: user.id,
    title: "Concept edited",
    body: `${displayNameForUser(user)} edited "${concept.updated.title}".`,
    href: `/concepts/${concept.updated.slug}`
  });
  redirect(contentLanguageViewHref("/concepts", concept.updated.slug, concept.updated.language) as Route);
}

export async function markConceptReviewedAction(conceptId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:review:${user.id}`, 30, 60_000);

  const concept = await prisma.$transaction(async (tx) => {
    const current = await tx.concept.findUnique({
      where: { id: conceptId },
      select: {
        id: true,
        slug: true,
        language: true,
        title: true,
        bodyMarkdown: true,
        kind: true,
        status: true,
        createdById: true,
        needsReviewAfterEdit: true
      }
    });
    if (!current) throw new Error("Concept not found.");
    if (
      (current.status === ConceptStatus.REVIEWED || current.status === ConceptStatus.EXCELLENT) &&
      !current.needsReviewAfterEdit
    ) {
      return current;
    }
    if (
      current.status !== ConceptStatus.USABLE &&
      current.status !== ConceptStatus.REVIEWED &&
      current.status !== ConceptStatus.EXCELLENT
    ) {
      throw new Error("A concept must be marked usable before it can be reviewed.");
    }
    if (!canReviewConcept(user, current)) {
      throw new Error("You cannot review this concept.");
    }

    const isReReview = current.needsReviewAfterEdit;
    await pinLatestConceptRevisionMetadata(tx, await conceptSnapshotSource(tx, current.id));
    const updated = await tx.concept.update({
      where: { id: current.id },
      data: {
        status: current.status === ConceptStatus.EXCELLENT ? ConceptStatus.EXCELLENT : ConceptStatus.REVIEWED,
        needsReviewAfterEdit: false
      }
    });
    const updatedSnapshot = buildConceptRevisionSnapshot(await conceptSnapshotSource(tx, updated.id));
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: current.id,
        markdown: current.bodyMarkdown,
        conceptTitle: current.title,
        conceptKind: current.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(updatedSnapshot),
        editedById: user.id,
        editSummary: isReReview ? "Concept re-reviewed after edits" : "Concept reviewed"
      }
    });
    await completeDailyConceptReviewForUser(tx, user.id, current.id);

    return updated;
  });

  revalidatePath("/concepts");
  revalidatePath(`/concepts/${concept.slug}`);
  revalidatePath(`/concepts/${concept.slug}/edit`);
  revalidatePath(`/concepts/${concept.slug}/history`);
}

export async function markConceptUsableAction(conceptId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:usable:${user.id}`, 30, 60_000);

  const concept = await prisma.$transaction(async (tx) => {
    const current = await tx.concept.findUnique({
      where: { id: conceptId },
      select: {
        id: true,
        slug: true,
        language: true,
        title: true,
        bodyMarkdown: true,
        kind: true,
        status: true,
        createdById: true
      }
    });
    if (!current) throw new Error("Concept not found.");
    if (current.status === ConceptStatus.USABLE) return current;
    if (current.status !== ConceptStatus.STUB && current.status !== ConceptStatus.MISSING) {
      throw new Error("Only a stub can be marked as usable from this action.");
    }
    if (!canChangeConceptStatus(user, current, ConceptStatus.USABLE)) {
      throw new Error("You cannot mark this concept as usable.");
    }

    await pinLatestConceptRevisionMetadata(tx, await conceptSnapshotSource(tx, current.id));
    const updated = await tx.concept.update({
      where: { id: current.id },
      data: { status: ConceptStatus.USABLE, needsReviewAfterEdit: false }
    });
    const updatedSnapshot = buildConceptRevisionSnapshot(await conceptSnapshotSource(tx, updated.id));
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: current.id,
        markdown: current.bodyMarkdown,
        conceptTitle: current.title,
        conceptKind: current.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(updatedSnapshot),
        editedById: user.id,
        editSummary: "Concept marked usable"
      }
    });
    await completeDailyConceptReviewForUser(tx, user.id, current.id);

    return updated;
  });

  revalidatePath("/concepts");
  revalidatePath(`/concepts/${concept.slug}`);
  revalidatePath(`/concepts/${concept.slug}/edit`);
  revalidatePath(`/concepts/${concept.slug}/history`);
}

export async function downgradeConceptStatusAction(conceptId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:downgrade:${user.id}`, 20, 60_000);

  const requestedStatus = String(formData.get("status") ?? "");
  if (!Object.values(ConceptStatus).includes(requestedStatus as ConceptStatus)) {
    throw new Error("Invalid concept status.");
  }
  const nextStatus = requestedStatus as ConceptStatus;
  const reason = requiredBoundedText(formData.get("reason"), CONTENT_LIMITS.shortText, "Reason");

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.concept.findUnique({
      where: { id: conceptId },
      select: {
        id: true,
        slug: true,
        title: true,
        bodyMarkdown: true,
        kind: true,
        status: true,
        createdById: true
      }
    });
    if (!current) throw new Error("Concept not found.");
    if (!canDowngradeConceptStatus(user, current, nextStatus)) {
      throw new Error("You cannot downgrade this concept to that status.");
    }

    await pinLatestConceptRevisionMetadata(tx, await conceptSnapshotSource(tx, current.id));
    const updated = await tx.concept.update({
      where: { id: current.id },
      data: {
        status: nextStatus,
        needsReviewAfterEdit: false
      }
    });
    const updatedSnapshot = buildConceptRevisionSnapshot(await conceptSnapshotSource(tx, updated.id));
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: current.id,
        markdown: current.bodyMarkdown,
        conceptTitle: current.title,
        conceptKind: current.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(updatedSnapshot),
        editedById: user.id,
        editSummary: `Status changed from ${current.status.toLowerCase()} to ${nextStatus.toLowerCase()}: ${reason}`
      }
    });
    await completeDailyConceptReviewForUser(tx, user.id, current.id);

    return { current, updated };
  });

  revalidatePath("/concepts");
  revalidatePath(`/concepts/${result.updated.slug}`);
  revalidatePath(`/concepts/${result.updated.slug}/edit`);
  revalidatePath(`/concepts/${result.updated.slug}/history`);

  if (result.current.status !== result.updated.status) {
    const notification = {
      title: "Concept status changed",
      body: `${displayNameForUser(user)} changed \"${result.updated.title}\" from ${result.current.status.toLowerCase()} to ${result.updated.status.toLowerCase()}.`,
      href: `/concepts/${result.updated.slug}/history`
    };
    await Promise.all([
      notifyOwnerOfSiteActivity({
        actor: user,
        type: NotificationType.CONCEPT_EDITED,
        ...notification
      }),
      notifyConceptAuthor({
        conceptId: result.updated.id,
        actorId: user.id,
        ...notification
      })
    ]);
  }
}

export async function dismissConceptTranslationStaleNoticeAction(conceptId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:translation-dismiss:${user.id}`, 30, 60_000);
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: {
      slug: true,
      language: true,
      translatedFromConcept: { select: { id: true, createdById: true } }
    }
  });

  if (!concept?.translatedFromConcept) {
    throw new Error("Translation source not found.");
  }
  if (concept.translatedFromConcept.createdById !== user.id && !canUseAdminTools(user)) {
    throw new Error("You cannot dismiss this translation notice.");
  }

  const latestSourceRevisionId = latestConceptTextRevisionIdFromRevisions(await prisma.pageRevision.findMany({
    where: { pageType: SourceType.CONCEPT, pageId: concept.translatedFromConcept.id },
    orderBy: { id: "asc" },
    select: { id: true, markdown: true, conceptTitle: true, conceptSnapshot: true }
  }));
  if (!latestSourceRevisionId) {
    throw new Error("Source revision not found.");
  }

  await prisma.$transaction(async (tx) => {
    const current = await conceptSnapshotSource(tx, conceptId);
    if (current.translatedFromRevisionId === latestSourceRevisionId) return;
    await pinLatestConceptRevisionMetadata(tx, current);
    const updated = await tx.concept.update({
      where: { id: conceptId },
      data: { translatedFromRevisionId: latestSourceRevisionId }
    });
    const updatedSnapshot = buildConceptRevisionSnapshot(await conceptSnapshotSource(tx, updated.id));
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: updated.id,
        markdown: updated.bodyMarkdown,
        conceptTitle: updated.title,
        conceptKind: updated.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(updatedSnapshot),
        editedById: user.id,
        editSummary: "Translation marked up to date"
      }
    });
  });

  revalidatePath(`/concepts/${concept.slug}`);
  revalidatePath(`/concepts/${concept.slug}/history`);
  redirect(contentLanguageViewHref("/concepts", concept.slug, concept.language) as Route);
}

export async function deleteConceptAction(conceptId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:delete:${user.id}`, 10, 60_000);
  const concept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: {
      id: true,
      slug: true,
      title: true,
      bodyMarkdown: true,
      kind: true,
      createdById: true,
      aliases: { select: { aliasSlug: true } }
    }
  });

  if (!concept) throw new Error("Concept not found.");
  if (!canDeleteConcept(user, concept)) {
    throw new Error("You cannot delete this concept.");
  }

  const targetSlugs = [concept.slug, ...concept.aliases.map((alias) => alias.aliasSlug)];
  await prisma.$transaction(async (tx) => {
    const current = await conceptSnapshotSource(tx, concept.id);
    const conceptSnapshot = buildConceptRevisionSnapshot(current);
    await pinLatestConceptRevisionMetadata(tx, current);
    await tx.internalLink.deleteMany({
      where: {
        sourceType: SourceType.CONCEPT,
        sourceId: concept.id
      }
    });
    await tx.internalLink.updateMany({
      where: {
        targetSlug: { in: targetSlugs }
      },
      data: {
        exists: false,
        targetType: TargetType.UNKNOWN
      }
    });
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: concept.id,
        markdown: concept.bodyMarkdown,
        conceptTitle: concept.title,
        conceptKind: concept.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(conceptSnapshot),
        editedById: user.id,
        editSummary: "Concept deleted"
      }
    });
    await tx.concept.delete({
      where: { id: concept.id }
    });
  });

  revalidatePath("/");
  revalidatePath("/concepts");
  revalidatePath(`/concepts/${concept.slug}`);
  redirect("/concepts");
}

export async function rollbackConceptRevisionAction(conceptId: number, revisionId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:rollback:${user.id}`, 8, 60_000);
  const [revision, existingConcept] = await Promise.all([
    prisma.pageRevision.findFirst({
      where: {
        id: revisionId,
        pageType: SourceType.CONCEPT,
        pageId: conceptId
      }
    }),
    prisma.concept.findUnique({
      where: { id: conceptId },
      select: {
        createdById: true,
        title: true,
        kind: true,
        bodyMarkdown: true,
        status: true,
        needsReviewAfterEdit: true
      }
    })
  ]);

  if (!revision) throw new Error("Revision not found.");
  if (!existingConcept) throw new Error("Concept not found.");
  if (!canRollbackConcept(user, existingConcept)) {
    throw new Error("You cannot roll back this concept.");
  }

  const concept = await prisma.$transaction(async (tx) => {
    await pinLatestConceptRevisionMetadata(tx, await conceptSnapshotSource(tx, conceptId));
    const updated = await tx.concept.update({
      where: { id: conceptId },
      data: {
        bodyMarkdown: revision.markdown,
        bodyHtml: await renderMarkdownContent(revision.markdown),
        ...(revision.conceptKind ? { kind: revision.conceptKind } : {}),
        needsReviewAfterEdit:
          existingConcept.needsReviewAfterEdit ||
          ((existingConcept.status === ConceptStatus.REVIEWED || existingConcept.status === ConceptStatus.EXCELLENT) &&
            revision.markdown !== existingConcept.bodyMarkdown),
        lastEditedById: user.id
      }
    });

    await syncInternalLinks(SourceType.CONCEPT, conceptId, revision.markdown, tx);
    const updatedSnapshot = buildConceptRevisionSnapshot(await conceptSnapshotSource(tx, updated.id));
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: conceptId,
        markdown: revision.markdown,
        conceptTitle: existingConcept.title,
        conceptKind: revision.conceptKind ?? existingConcept.kind,
        conceptSnapshot: conceptRevisionSnapshotJson(updatedSnapshot),
        editedById: user.id,
        editSummary: `Rolled back to revision ${revision.id}`
      }
    });
    await completeDailyConceptReviewForUser(tx, user.id, conceptId);

    return updated;
  });

  await refreshLinksForConcept(concept.slug);
  revalidatePath(`/concepts/${concept.slug}`);
  await notifyOwnerOfSiteActivity({
    actor: user,
    type: NotificationType.CONCEPT_EDITED,
    title: "Concept edited",
    body: `${displayNameForUser(user)} rolled back "${concept.title}".`,
    href: `/concepts/${concept.slug}`
  });
  await notifyConceptAuthor({
    conceptId: concept.id,
    actorId: user.id,
    title: "Concept edited",
    body: `${displayNameForUser(user)} rolled back "${concept.title}".`,
    href: `/concepts/${concept.slug}`
  });
  redirect(contentLanguageViewHref("/concepts", concept.slug, concept.language) as Route);
}
