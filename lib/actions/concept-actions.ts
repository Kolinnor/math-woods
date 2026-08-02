"use server";

import type { Route } from "next";
import { ConceptStatus, NotificationType, SourceType, TargetType } from "@prisma/client";
import type { ConceptKind, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkConceptAchievements } from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { parseConceptExerciseIds } from "@/lib/concept-exercises";
import { parseConceptKind } from "@/lib/concept-kinds";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { assertDailyContentCreationQuota } from "@/lib/content-creation-quota";
import { prisma } from "@/lib/db";
import { notifyConceptAuthor, notifyOwnerOfSiteActivity } from "@/lib/notifications";
import { parseAliases, parseReferences, syncConceptAliases, syncConceptReferences } from "@/lib/concept-metadata";
import { coarseDomainForCode, parseDomainCode } from "@/lib/domains";
import { refreshLinksForConcept, refreshLinksForConceptId, syncInternalLinks } from "@/lib/internal-links";
import { parseContentLanguage, parseTranslationGroupId } from "@/lib/languages";
import {
  canChangeConceptStatus,
  canDeleteConcept,
  canEditConcept,
  canReviewConcept,
  canRollbackConcept,
  canUseAdminTools
} from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { contentLanguageViewHref } from "@/lib/translation-routing";
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
  conceptId: number,
  title: string,
  kind: ConceptKind
) {
  const latestRevision = await tx.pageRevision.findFirst({
    where: { pageType: SourceType.CONCEPT, pageId: conceptId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, conceptTitle: true, conceptKind: true }
  });
  if (latestRevision && (latestRevision.conceptTitle === null || latestRevision.conceptKind === null)) {
    await tx.pageRevision.update({
      where: { id: latestRevision.id },
      data: {
        ...(latestRevision.conceptTitle === null ? { conceptTitle: title } : {}),
        ...(latestRevision.conceptKind === null ? { conceptKind: kind } : {})
      }
    });
  }
}

export async function createConceptAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:create:${user.id}`, 5, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
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
            select: { id: true }
          })
        : null;
    const sourceRevision = translationSource
      ? await tx.pageRevision.findFirst({
          where: { pageType: SourceType.CONCEPT, pageId: translationSource.id },
          orderBy: { id: "desc" },
          select: { id: true }
        })
      : null;

    const created = await tx.concept.create({
      data: {
        slug,
        language,
        ...(translationGroupId ? { translationGroupId } : {}),
        ...(translationSource
          ? {
              translatedFromConceptId: translationSource.id,
              translatedFromRevisionId: sourceRevision?.id ?? null
            }
          : {}),
        title,
        bodyMarkdown,
        bodyHtml,
        domain,
        domainCode,
        kind,
        createdById: user.id,
        lastEditedById: user.id
      }
    });
    await syncInternalLinks(SourceType.CONCEPT, created.id, bodyMarkdown, tx, language);
    await syncConceptAliases(created.id, aliases, tx);
    await syncConceptReferences(created.id, references, tx);
    await refreshLinksForConceptId(created.id, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: created.id,
        markdown: bodyMarkdown,
        conceptTitle: created.title,
        conceptKind: created.kind,
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
      status: true
    }
  });
  if (!existingConcept) throw new Error("Concept not found.");
  if (!canEditConcept(user, existingConcept)) {
    throw new Error("You cannot edit this concept.");
  }

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Concept content");
  const kind = parseConceptKind(formData.get("kind"), existingConcept.kind);
  const domainCode = parseDomainCode(formData.get("domain"));
  const domain = coarseDomainForCode(domainCode);
  const aliases = parseAliases(boundedText(formData.get("aliases"), CONTENT_LIMITS.mediumText, "Aliases"));
  const references = parseReferences(boundedText(formData.get("references"), CONTENT_LIMITS.longNote, "References"));
  const exerciseIds = parseConceptExerciseIds(formData.getAll("exerciseIds"));
  const editSummary = boundedText(formData.get("editSummary"), CONTENT_LIMITS.shortText, "Edit summary") || "Concept edited";
  const markTranslationFresh = formData.get("markTranslationFresh") === "on";
  const statusInput = formData.get("status");
  const requestedStatus = String(statusInput ?? "") as ConceptStatus;
  const status =
    statusInput && canChangeConceptStatus(user, existingConcept, requestedStatus)
      ? requestedStatus
      : undefined;
  if (statusInput && !status) {
    throw new Error("A concept must be reviewed by another trusted user.");
  }
  const canAppearInConceptBrowser = canUseAdminTools(user)
    ? formData.get("canAppearInConceptBrowser") === "on"
    : undefined;

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  const concept = await prisma.$transaction(async (tx) => {
    await pinLatestConceptRevisionMetadata(tx, conceptId, existingConcept.title, existingConcept.kind);
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

    const refreshedSourceRevision =
      markTranslationFresh && existingConcept.translatedFromConceptId
        ? await tx.pageRevision.findFirst({
            where: { pageType: SourceType.CONCEPT, pageId: existingConcept.translatedFromConceptId },
            orderBy: { id: "desc" },
            select: { id: true }
          })
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
        ...(status ? { status } : {}),
        ...(canAppearInConceptBrowser !== undefined ? { canAppearInConceptBrowser } : {}),
        ...(refreshedSourceRevision ? { translatedFromRevisionId: refreshedSourceRevision.id } : {}),
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
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: updated.id,
        markdown: bodyMarkdown,
        conceptTitle: updated.title,
        conceptKind: updated.kind,
        editedById: user.id,
        editSummary
      }
    });

    return updated;
  });

  await refreshLinksForConcept(concept.slug);
  revalidatePath("/concepts");
  revalidatePath(`/concepts/${concept.slug}`);
  await notifyOwnerOfSiteActivity({
    actor: user,
    type: NotificationType.CONCEPT_EDITED,
    title: "Concept edited",
    body: `${displayNameForUser(user)} edited "${concept.title}".`,
    href: `/concepts/${concept.slug}`
  });
  await notifyConceptAuthor({
    conceptId: concept.id,
    actorId: user.id,
    title: "Concept edited",
    body: `${displayNameForUser(user)} edited "${concept.title}".`,
    href: `/concepts/${concept.slug}`
  });
  redirect(contentLanguageViewHref("/concepts", concept.slug, concept.language) as Route);
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
        createdById: true
      }
    });
    if (!current) throw new Error("Concept not found.");
    if (current.status === ConceptStatus.REVIEWED || current.status === ConceptStatus.EXCELLENT) {
      return current;
    }
    if (current.status !== ConceptStatus.USABLE) {
      throw new Error("A concept must be marked usable before it can be reviewed.");
    }
    if (!canReviewConcept(user, current)) {
      throw new Error("You cannot review this concept.");
    }

    await pinLatestConceptRevisionMetadata(tx, current.id, current.title, current.kind);
    const updated = await tx.concept.update({
      where: { id: current.id },
      data: { status: ConceptStatus.REVIEWED }
    });
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: current.id,
        markdown: current.bodyMarkdown,
        conceptTitle: current.title,
        conceptKind: current.kind,
        editedById: user.id,
        editSummary: "Concept reviewed"
      }
    });

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

    await pinLatestConceptRevisionMetadata(tx, current.id, current.title, current.kind);
    const updated = await tx.concept.update({
      where: { id: current.id },
      data: { status: ConceptStatus.USABLE }
    });
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: current.id,
        markdown: current.bodyMarkdown,
        conceptTitle: current.title,
        conceptKind: current.kind,
        editedById: user.id,
        editSummary: "Concept marked usable"
      }
    });

    return updated;
  });

  revalidatePath("/concepts");
  revalidatePath(`/concepts/${concept.slug}`);
  revalidatePath(`/concepts/${concept.slug}/edit`);
  revalidatePath(`/concepts/${concept.slug}/history`);
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

  const latestSourceRevision = await prisma.pageRevision.findFirst({
    where: { pageType: SourceType.CONCEPT, pageId: concept.translatedFromConcept.id },
    orderBy: { id: "desc" },
    select: { id: true }
  });
  if (!latestSourceRevision) {
    throw new Error("Source revision not found.");
  }

  await prisma.concept.update({
    where: { id: conceptId },
    data: { translatedFromRevisionId: latestSourceRevision.id }
  });

  revalidatePath(`/concepts/${concept.slug}`);
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
    await pinLatestConceptRevisionMetadata(tx, concept.id, concept.title, concept.kind);
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
      select: { createdById: true, title: true, kind: true }
    })
  ]);

  if (!revision) throw new Error("Revision not found.");
  if (!existingConcept) throw new Error("Concept not found.");
  if (!canRollbackConcept(user, existingConcept)) {
    throw new Error("You cannot roll back this concept.");
  }

  const concept = await prisma.$transaction(async (tx) => {
    await pinLatestConceptRevisionMetadata(tx, conceptId, existingConcept.title, existingConcept.kind);
    const updated = await tx.concept.update({
      where: { id: conceptId },
      data: {
        bodyMarkdown: revision.markdown,
        bodyHtml: await renderMarkdownContent(revision.markdown),
        ...(revision.conceptKind ? { kind: revision.conceptKind } : {}),
        lastEditedById: user.id
      }
    });

    await syncInternalLinks(SourceType.CONCEPT, conceptId, revision.markdown, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: conceptId,
        markdown: revision.markdown,
        conceptTitle: existingConcept.title,
        conceptKind: revision.conceptKind ?? existingConcept.kind,
        editedById: user.id,
        editSummary: `Rolled back to revision ${revision.id}`
      }
    });

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
