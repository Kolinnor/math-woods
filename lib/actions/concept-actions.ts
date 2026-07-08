"use server";

import { ConceptStatus, NotificationType, SourceType, TargetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkConceptAchievements } from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { notifyOwnerOfSiteActivity } from "@/lib/notifications";
import { parseAliases, parseReferences, syncConceptAliases, syncConceptReferences } from "@/lib/concept-metadata";
import { parseMathDomain } from "@/lib/domains";
import { refreshLinksForConcept, refreshLinksForConceptId, syncInternalLinks } from "@/lib/internal-links";
import { parseContentLanguage, parseTranslationGroupId } from "@/lib/languages";
import { canDeleteConcept, canEditConcept, canRollbackConcept, canSetConceptStatus, canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { uniqueSlug } from "@/lib/unique-slug";
import { displayNameForUser } from "@/lib/user-display";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

function duplicateConceptTitleError() {
  return new Error("A concept card already exists with this title.");
}

export async function createConceptAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:create:${user.id}`, 5, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const translationGroupId = parseTranslationGroupId(formData.get("translationGroupId"));
  const translationSourceSlug = ensureSlug(String(formData.get("translationSourceSlug") ?? ""), "");
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Concept content");
  const domain = parseMathDomain(formData.get("domain"));
  const aliases = parseAliases(boundedText(formData.get("aliases"), CONTENT_LIMITS.mediumText, "Aliases"));
  const references = parseReferences(boundedText(formData.get("references"), CONTENT_LIMITS.longNote, "References"));

  const slug = await uniqueSlug("concept", title);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const concept = await prisma.$transaction(async (tx) => {
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
        editedById: user.id,
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
  redirect(`/concepts/${concept.slug}`);
}

export async function updateConceptAction(conceptId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:update:${user.id}`, 20, 60_000);
  const existingConcept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: { createdById: true, language: true, title: true, translationGroupId: true, translatedFromConceptId: true }
  });
  if (!existingConcept) throw new Error("Concept not found.");
  if (!canEditConcept(user, existingConcept)) {
    throw new Error("You cannot edit this concept.");
  }

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Concept content");
  const domain = parseMathDomain(formData.get("domain"));
  const aliases = parseAliases(boundedText(formData.get("aliases"), CONTENT_LIMITS.mediumText, "Aliases"));
  const references = parseReferences(boundedText(formData.get("references"), CONTENT_LIMITS.longNote, "References"));
  const editSummary = boundedText(formData.get("editSummary"), CONTENT_LIMITS.shortText, "Edit summary") || "Concept edited";
  const markTranslationFresh = formData.get("markTranslationFresh") === "on";
  const statusInput = formData.get("status");
  const requestedStatus = String(statusInput ?? "") as ConceptStatus;
  const status = statusInput && canSetConceptStatus(user.role, requestedStatus) ? requestedStatus : undefined;
  const canAppearInConceptBrowser = canUseAdminTools(user)
    ? formData.get("canAppearInConceptBrowser") === "on"
    : undefined;

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  const concept = await prisma.$transaction(async (tx) => {
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
        ...(status ? { status } : {}),
        ...(canAppearInConceptBrowser !== undefined ? { canAppearInConceptBrowser } : {}),
        ...(refreshedSourceRevision ? { translatedFromRevisionId: refreshedSourceRevision.id } : {}),
        lastEditedById: user.id
      }
    });

    await syncInternalLinks(SourceType.CONCEPT, updated.id, bodyMarkdown, tx, language);
    await syncConceptAliases(updated.id, aliases, tx);
    await syncConceptReferences(updated.id, references, tx);
    await refreshLinksForConceptId(updated.id, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: updated.id,
        markdown: bodyMarkdown,
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
  redirect(`/concepts/${concept.slug}`);
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
      select: { createdById: true }
    })
  ]);

  if (!revision) throw new Error("Revision not found.");
  if (!existingConcept) throw new Error("Concept not found.");
  if (!canRollbackConcept(user, existingConcept)) {
    throw new Error("You cannot roll back this concept.");
  }

  const concept = await prisma.$transaction(async (tx) => {
    const updated = await tx.concept.update({
      where: { id: conceptId },
      data: {
        bodyMarkdown: revision.markdown,
        bodyHtml: await renderMarkdownContent(revision.markdown),
        lastEditedById: user.id
      }
    });

    await syncInternalLinks(SourceType.CONCEPT, conceptId, revision.markdown, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.CONCEPT,
        pageId: conceptId,
        markdown: revision.markdown,
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
  redirect(`/concepts/${concept.slug}`);
}
