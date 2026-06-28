"use server";

import { ConceptStatus, SourceType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkConceptAchievements } from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { parseAliases, parseReferences, syncConceptAliases, syncConceptReferences } from "@/lib/concept-metadata";
import { parseMathDomain } from "@/lib/domains";
import { refreshLinksForConcept, syncInternalLinks } from "@/lib/internal-links";
import { parseContentLanguage, parseTranslationGroupId } from "@/lib/languages";
import { canEditConcept, canRollbackConcept, canSetConceptStatus } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createConceptAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:create:${user.id}`, 5, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const translationGroupId = parseTranslationGroupId(formData.get("translationGroupId"));
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Concept content");
  const domain = parseMathDomain(formData.get("domain"));
  const aliases = parseAliases(boundedText(formData.get("aliases"), CONTENT_LIMITS.mediumText, "Aliases"));
  const references = parseReferences(boundedText(formData.get("references"), CONTENT_LIMITS.longNote, "References"));

  const slug = await uniqueSlug("concept", title);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const concept = await prisma.$transaction(async (tx) => {
    if (translationGroupId) {
      const existingTranslation = await tx.concept.findFirst({
        where: { translationGroupId, language },
        select: { slug: true }
      });
      if (existingTranslation) {
        throw new Error("A concept translation already exists in this language.");
      }
    }

    const created = await tx.concept.create({
      data: {
        slug,
        language,
        ...(translationGroupId ? { translationGroupId } : {}),
        title,
        bodyMarkdown,
        bodyHtml,
        domain,
        createdById: user.id,
        lastEditedById: user.id
      }
    });
    await syncInternalLinks(SourceType.CONCEPT, created.id, bodyMarkdown, tx);
    await syncConceptAliases(created.id, aliases, tx);
    await syncConceptReferences(created.id, references, tx);
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
  await checkConceptAchievements(user.id);
  redirect(`/concepts/${concept.slug}`);
}

export async function updateConceptAction(conceptId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept:update:${user.id}`, 20, 60_000);
  const existingConcept = await prisma.concept.findUnique({
    where: { id: conceptId },
    select: { createdById: true }
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
  const statusInput = formData.get("status");
  const requestedStatus = String(statusInput ?? "") as ConceptStatus;
  const status = statusInput && canSetConceptStatus(user.role, requestedStatus) ? requestedStatus : undefined;

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  const concept = await prisma.$transaction(async (tx) => {
    const updated = await tx.concept.update({
      where: { id: conceptId },
      data: {
        title,
        language,
        bodyMarkdown,
        bodyHtml,
        domain,
        ...(status ? { status } : {}),
        lastEditedById: user.id
      }
    });

    await syncInternalLinks(SourceType.CONCEPT, updated.id, bodyMarkdown, tx);
    await syncConceptAliases(updated.id, aliases, tx);
    await syncConceptReferences(updated.id, references, tx);
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
  revalidatePath(`/concepts/${concept.slug}`);
  redirect(`/concepts/${concept.slug}`);
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
  redirect(`/concepts/${concept.slug}`);
}
