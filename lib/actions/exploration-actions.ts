"use server";

import {
  ExplorationBlockKind,
  ExplorationCollaboratorRole,
  ExplorationQuizType,
  ExplorationSessionStatus,
  ExplorationStatus,
  MathDomain,
  NotificationType,
  PlaylistVisibility,
  Prisma
} from "@prisma/client";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, requireVerifiedUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import {
  applyEffects,
  asExplorationState,
  conditionFromFields,
  effectsFromFields,
  normalizedTextAnswer,
  numericAnswerMatches,
  parseExplorationValue,
  type ExplorationState
} from "@/lib/exploration-engine";
import {
  canEditExploration,
  canReviewExploration,
  canViewExploration,
  clampOptionalInteger
} from "@/lib/explorations";
import { explorationSnapshotPages, findSnapshotBlock } from "@/lib/exploration-snapshot";
import { parseContentLanguage } from "@/lib/languages";
import { createNotification } from "@/lib/notifications";
import { hasAdminPrivileges } from "@/lib/permissions";
import { ensureSlug } from "@/lib/slug";
import { uniqueSlug } from "@/lib/unique-slug";

async function renderMarkdownContent(markdown: string) {
  if (!markdown) return "";
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

function enumValue<T extends string>(values: readonly T[], value: FormDataEntryValue | null, fallback: T) {
  const text = String(value ?? "");
  return values.includes(text as T) ? (text as T) : fallback;
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeCoverImageUrl(value: FormDataEntryValue | null) {
  const url = boundedText(value, CONTENT_LIMITS.mediumText, "Cover image URL");
  if (!url) return null;
  if (url.startsWith("/") || url.startsWith("https://")) return url;
  throw new Error("Cover image URL must use HTTPS or a local site path.");
}

function revalidateExploration(slug: string, { editor = true }: { editor?: boolean } = {}) {
  revalidatePath("/explorations");
  revalidatePath(`/explorations/${slug}`);
  revalidatePath(`/explorations/${slug}/start`);
  if (editor) revalidatePath(`/explorations/${slug}/edit`);
  revalidatePath(`/explorations/${slug}/history`);
}

async function requireExplorationEditor(playlistId: number) {
  const user = await requireVerifiedUser();
  const exploration = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { collaborators: true }
  });
  if (!exploration) throw new Error("Exploration not found.");
  if (!canEditExploration(user, exploration)) throw new Error("You cannot edit this exploration.");
  return { user, exploration };
}

async function requirePageEditor(pageId: number) {
  const page = await prisma.explorationPage.findUnique({
    where: { id: pageId },
    include: { playlist: { include: { collaborators: true } } }
  });
  if (!page) throw new Error("Exploration page not found.");
  const user = await requireVerifiedUser();
  if (!canEditExploration(user, page.playlist)) throw new Error("You cannot edit this exploration.");
  return { user, page, exploration: page.playlist };
}

async function requireBlockEditor(blockId: number) {
  const block = await prisma.explorationBlock.findUnique({
    where: { id: blockId },
    include: { page: { include: { playlist: { include: { collaborators: true } } } } }
  });
  if (!block) throw new Error("Exploration block not found.");
  const user = await requireVerifiedUser();
  if (!canEditExploration(user, block.page.playlist)) throw new Error("You cannot edit this exploration.");
  return { user, block, page: block.page, exploration: block.page.playlist };
}

async function uniquePageSlug(playlistId: number, source: string, exceptId?: number) {
  const base = ensureSlug(source, "page");
  let candidate = base;
  let suffix = 2;
  while (
    await prisma.explorationPage.findFirst({
      where: { playlistId, slug: candidate, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true }
    })
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function ruleFromForm(formData: FormData) {
  return conditionFromFields(
    formData.get("conditionVariable"),
    formData.get("conditionOperator"),
    formData.get("conditionValue")
  );
}

function blockSettings(formData: FormData) {
  const expectedAnswer = boundedText(formData.get("expectedAnswer"), CONTENT_LIMITS.mediumText, "Expected answer");
  const tolerance = String(formData.get("tolerance") ?? "").trim();
  return {
    ...(expectedAnswer ? { expectedAnswer } : {}),
    ...(tolerance ? { tolerance: Number(tolerance) || 0 } : {}),
    caseSensitive: formData.get("caseSensitive") === "on"
  };
}

export async function createExplorationAction(formData: FormData) {
  const user = await requireVerifiedUser();
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const summary = boundedText(formData.get("summary"), CONTENT_LIMITS.shortText, "Summary") || null;
  const descriptionMarkdown = boundedText(
    formData.get("descriptionMarkdown"),
    CONTENT_LIMITS.markdown,
    "Exploration introduction"
  );
  const slug = await uniqueSlug("playlist", title);
  const descriptionHtml = await renderMarkdownContent(descriptionMarkdown);

  const exploration = await prisma.$transaction(async (tx) => {
    const created = await tx.playlist.create({
      data: {
        slug,
        language,
        title,
        summary,
        descriptionMarkdown,
        descriptionHtml,
        authorId: user.id,
        status: ExplorationStatus.DRAFT,
        visibility: PlaylistVisibility.PRIVATE
      }
    });
    const page = await tx.explorationPage.create({
      data: {
        playlistId: created.id,
        slug: "introduction",
        title: "Introduction",
        position: 1,
        isStart: true,
        isEnd: true
      }
    });
    if (descriptionMarkdown) {
      await tx.explorationBlock.create({
        data: {
          pageId: page.id,
          kind: ExplorationBlockKind.MARKDOWN,
          bodyMarkdown: descriptionMarkdown,
          bodyHtml: descriptionHtml,
          position: 1
        }
      });
    }
    return created;
  });

  revalidateExploration(exploration.slug);
  redirect(`/explorations/${exploration.slug}/edit` as Route);
}

export async function updateExplorationMetadataAction(playlistId: number, formData: FormData) {
  const { exploration } = await requireExplorationEditor(playlistId);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const summary = boundedText(formData.get("summary"), CONTENT_LIMITS.shortText, "Summary") || null;
  const descriptionMarkdown = boundedText(formData.get("descriptionMarkdown"), CONTENT_LIMITS.markdown, "Introduction");
  const prerequisitesMarkdown = boundedText(
    formData.get("prerequisitesMarkdown"),
    CONTENT_LIMITS.longNote,
    "Prerequisites"
  ) || null;
  const coverImageUrl = safeCoverImageUrl(formData.get("coverImageUrl"));
  const audience = boundedText(formData.get("audience"), CONTENT_LIMITS.shortText, "Audience") || null;
  const license = boundedText(formData.get("license"), CONTENT_LIMITS.shortText, "License") || "CC BY-NC-SA 4.0";
  const domain = enumValue(Object.values(MathDomain), formData.get("domain"), MathDomain.OTHER);
  const visibility = enumValue(
    Object.values(PlaylistVisibility),
    formData.get("visibility"),
    PlaylistVisibility.PRIVATE
  );
  const estimatedMinutes = clampOptionalInteger(formData.get("estimatedMinutes"), 1, 100000);
  const difficulty = clampOptionalInteger(formData.get("difficulty"), 0, 100);

  await prisma.playlist.update({
    where: { id: playlistId },
    data: {
      title,
      summary,
      descriptionMarkdown,
      descriptionHtml: await renderMarkdownContent(descriptionMarkdown),
      coverImageUrl,
      domain,
      audience,
      prerequisitesMarkdown,
      prerequisitesHtml: prerequisitesMarkdown ? await renderMarkdownContent(prerequisitesMarkdown) : null,
      estimatedMinutes,
      difficulty,
      license,
      visibility
    }
  });

  revalidateExploration(exploration.slug);
}

export async function createExplorationPageAction(playlistId: number, formData: FormData) {
  const { exploration } = await requireExplorationEditor(playlistId);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Page title");
  const summary = boundedText(formData.get("summary"), CONTENT_LIMITS.shortText, "Page summary") || null;
  const slug = await uniquePageSlug(playlistId, String(formData.get("slug") || title));
  const last = await prisma.explorationPage.findFirst({ where: { playlistId }, orderBy: { position: "desc" } });
  const wantsStart = formData.get("isStart") === "on";
  const count = await prisma.explorationPage.count({ where: { playlistId } });
  const isStart = wantsStart || count === 0;

  const page = await prisma.$transaction(async (tx) => {
    if (isStart) await tx.explorationPage.updateMany({ where: { playlistId }, data: { isStart: false } });
    await tx.explorationPage.updateMany({ where: { playlistId }, data: { isEnd: false } });
    return tx.explorationPage.create({
      data: {
        playlistId,
        title,
        summary,
        slug,
        position: (last?.position ?? 0) + 1,
        isStart,
        isEnd: true,
        visibilityRule: ruleFromForm(formData) ? jsonInput(ruleFromForm(formData)) : Prisma.JsonNull
      }
    });
  });

  // The editor is force-dynamic and the client navigates to the new page itself.
  // Avoid refreshing the current studio before that soft navigation completes.
  revalidateExploration(exploration.slug, { editor: false });
  return { pageId: page.id };
}

export async function updateExplorationPageAction(pageId: number, formData: FormData) {
  const { page, exploration } = await requirePageEditor(pageId);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Page title");
  const summary = boundedText(formData.get("summary"), CONTENT_LIMITS.shortText, "Page summary") || null;
  const slug = await uniquePageSlug(page.playlistId, String(formData.get("slug") || title), page.id);
  const isStart = formData.get("isStart") === "on";
  const isEnd = formData.get("isEnd") === "on";
  const rule = ruleFromForm(formData);

  await prisma.$transaction(async (tx) => {
    if (isStart) await tx.explorationPage.updateMany({ where: { playlistId: page.playlistId }, data: { isStart: false } });
    if (isEnd) await tx.explorationPage.updateMany({ where: { playlistId: page.playlistId }, data: { isEnd: false } });
    await tx.explorationPage.update({
      where: { id: pageId },
      data: {
        title,
        summary,
        slug,
        isStart: isStart || page.isStart,
        isEnd: isEnd || page.isEnd,
        visibilityRule: rule ? jsonInput(rule) : Prisma.JsonNull
      }
    });
  });
  revalidateExploration(exploration.slug);
}

export async function setExplorationPagePositionAction(pageId: number, requestedPosition: number) {
  const { page, exploration } = await requirePageEditor(pageId);
  const pages = await prisma.explorationPage.findMany({
    where: { playlistId: page.playlistId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true }
  });
  const position = Number.isFinite(requestedPosition)
    ? Math.max(1, Math.min(pages.length, Math.trunc(requestedPosition)))
    : page.position;
  const reordered = pages.filter((candidate) => candidate.id !== page.id);
  reordered.splice(position - 1, 0, { id: page.id });

  await prisma.$transaction(
    reordered.map((candidate, index) => prisma.explorationPage.update({
      where: { id: candidate.id },
      data: { position: index + 1 }
    }))
  );
  revalidateExploration(exploration.slug, { editor: false });
  return { position };
}

export async function deleteExplorationPageAction(pageId: number) {
  const { page, exploration } = await requirePageEditor(pageId);
  const pages = await prisma.explorationPage.findMany({
    where: { playlistId: page.playlistId },
    orderBy: { position: "asc" },
    select: { id: true, isStart: true, isEnd: true }
  });
  if (pages.length <= 1) throw new Error("An exploration must keep at least one page.");
  const remainingPages = pages.filter((item) => item.id !== page.id);
  const replacement = remainingPages[0]!;
  const endingReplacement = remainingPages.at(-1)!;
  await prisma.$transaction(async (tx) => {
    await tx.explorationPage.delete({ where: { id: page.id } });
    if (page.isStart) await tx.explorationPage.update({ where: { id: replacement.id }, data: { isStart: true } });
    if (page.isEnd) await tx.explorationPage.update({ where: { id: endingReplacement.id }, data: { isEnd: true } });
  });
  revalidateExploration(exploration.slug);
  redirect(`/explorations/${exploration.slug}/edit?page=${replacement.id}` as Route);
}

export async function createExplorationBlockAction(pageId: number, formData: FormData) {
  const { page, exploration } = await requirePageEditor(pageId);
  const kind = enumValue(Object.values(ExplorationBlockKind), formData.get("kind"), ExplorationBlockKind.MARKDOWN);
  const referenceSlug = ensureSlug(String(formData.get("referenceSlug") ?? ""));
  const [problem, concept, last] = await Promise.all([
    kind === ExplorationBlockKind.PROBLEM && referenceSlug
      ? prisma.problem.findUnique({ where: { slug: referenceSlug }, select: { id: true } })
      : null,
    kind === ExplorationBlockKind.CONCEPT && referenceSlug
      ? prisma.concept.findUnique({ where: { slug: referenceSlug }, select: { id: true } })
      : null,
    prisma.explorationBlock.findFirst({ where: { pageId }, orderBy: { position: "desc" } })
  ]);
  if (kind === ExplorationBlockKind.PROBLEM && !problem) throw new Error("Problem not found.");
  if (kind === ExplorationBlockKind.CONCEPT && !concept) throw new Error("Concept not found.");
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Block content") || null;
  const quizType = kind === ExplorationBlockKind.QUIZ
    ? enumValue(Object.values(ExplorationQuizType), formData.get("quizType"), ExplorationQuizType.SINGLE_CHOICE)
    : null;

  const block = await prisma.explorationBlock.create({
    data: {
      pageId,
      kind,
      bodyMarkdown,
      bodyHtml: bodyMarkdown ? await renderMarkdownContent(bodyMarkdown) : null,
      position: (last?.position ?? 0) + 1,
      problemId: problem?.id ?? null,
      conceptId: concept?.id ?? null,
      quizType,
      settings: quizType ? jsonInput(blockSettings(formData)) : Prisma.JsonNull,
      required: formData.get("required") === "on",
      points: clampOptionalInteger(formData.get("points"), 0, 10000) ?? 0
    }
  });

  if (quizType === ExplorationQuizType.TRUE_FALSE) {
    await prisma.explorationBlockOption.createMany({
      data: [
        { blockId: block.id, label: "True", value: "true", position: 1, isCorrect: true },
        { blockId: block.id, label: "False", value: "false", position: 2, isCorrect: false }
      ]
    });
  }
  // Keep the current studio mounted while its client form selects the new block.
  revalidateExploration(exploration.slug, { editor: false });
  return { blockId: block.id };
}

export async function updateExplorationBlockAction(blockId: number, formData: FormData) {
  const { block, exploration } = await requireBlockEditor(blockId);
  const kind = enumValue(Object.values(ExplorationBlockKind), formData.get("kind"), block.kind);
  const quizType = kind === ExplorationBlockKind.QUIZ
    ? enumValue(Object.values(ExplorationQuizType), formData.get("quizType"), block.quizType ?? ExplorationQuizType.SINGLE_CHOICE)
    : null;
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Block content") || null;
  const explanationMarkdown = boundedText(
    formData.get("explanationMarkdown"),
    CONTENT_LIMITS.markdown,
    "Explanation"
  ) || null;
  // A newly selected reference type has no matching slug field until the editor rerenders.
  const referenceSlug = block.kind === kind
    ? ensureSlug(String(formData.get("referenceSlug") ?? ""))
    : "";
  const problem = kind === ExplorationBlockKind.PROBLEM && referenceSlug
    ? await prisma.problem.findUnique({ where: { slug: referenceSlug }, select: { id: true } })
    : null;
  const concept = kind === ExplorationBlockKind.CONCEPT && referenceSlug
    ? await prisma.concept.findUnique({ where: { slug: referenceSlug }, select: { id: true } })
    : null;
  if (kind === ExplorationBlockKind.PROBLEM && block.kind === kind && !problem) throw new Error("Problem not found.");
  if (kind === ExplorationBlockKind.CONCEPT && block.kind === kind && !concept) throw new Error("Concept not found.");
  const rule = ruleFromForm(formData);

  await prisma.explorationBlock.update({
    where: { id: blockId },
    data: {
      kind,
      bodyMarkdown,
      bodyHtml: bodyMarkdown ? await renderMarkdownContent(bodyMarkdown) : null,
      explanationMarkdown,
      explanationHtml: explanationMarkdown ? await renderMarkdownContent(explanationMarkdown) : null,
      problemId: problem?.id ?? null,
      conceptId: concept?.id ?? null,
      quizType,
      settings: quizType ? jsonInput(blockSettings(formData)) : Prisma.JsonNull,
      visibilityRule: rule ? jsonInput(rule) : Prisma.JsonNull,
      required: formData.get("required") === "on",
      points: clampOptionalInteger(formData.get("points"), 0, 10000) ?? 0
    }
  });
  revalidateExploration(exploration.slug);
}

export async function setExplorationBlockPositionAction(blockId: number, requestedPosition: number) {
  const { block, exploration } = await requireBlockEditor(blockId);
  const blocks = await prisma.explorationBlock.findMany({
    where: { pageId: block.pageId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true }
  });
  const position = Number.isFinite(requestedPosition)
    ? Math.max(1, Math.min(blocks.length, Math.trunc(requestedPosition)))
    : block.position;
  const reordered = blocks.filter((candidate) => candidate.id !== block.id);
  reordered.splice(position - 1, 0, { id: block.id });

  await prisma.$transaction(
    reordered.map((candidate, index) => prisma.explorationBlock.update({
      where: { id: candidate.id },
      data: { position: index + 1 }
    }))
  );
  revalidateExploration(exploration.slug, { editor: false });
  return { position };
}

export async function moveExplorationBlockAction(blockId: number, direction: "up" | "down") {
  const { block, exploration } = await requireBlockEditor(blockId);
  const sibling = await prisma.explorationBlock.findFirst({
    where: { pageId: block.pageId, position: direction === "up" ? { lt: block.position } : { gt: block.position } },
    orderBy: { position: direction === "up" ? "desc" : "asc" }
  });
  if (!sibling) return;
  await prisma.$transaction([
    prisma.explorationBlock.update({ where: { id: block.id }, data: { position: sibling.position } }),
    prisma.explorationBlock.update({ where: { id: sibling.id }, data: { position: block.position } })
  ]);
  revalidateExploration(exploration.slug);
}

export async function deleteExplorationBlockAction(blockId: number) {
  const { exploration } = await requireBlockEditor(blockId);
  await prisma.explorationBlock.delete({ where: { id: blockId } });
  revalidateExploration(exploration.slug);
}

export async function createExplorationOptionAction(blockId: number, formData: FormData) {
  const { block, exploration } = await requireBlockEditor(blockId);
  if (block.kind !== ExplorationBlockKind.QUIZ && block.kind !== ExplorationBlockKind.CHOICE) {
    throw new Error("Only quiz and choice blocks accept options.");
  }
  const label = requiredBoundedText(formData.get("label"), CONTENT_LIMITS.shortText, "Option label");
  const value = boundedText(formData.get("value"), CONTENT_LIMITS.shortText, "Option value") || null;
  const feedbackMarkdown = boundedText(formData.get("feedbackMarkdown"), CONTENT_LIMITS.longNote, "Feedback") || null;
  const toPageId = Number(formData.get("toPageId")) || null;
  if (toPageId) {
    const target = await prisma.explorationPage.findFirst({ where: { id: toPageId, playlistId: exploration.id } });
    if (!target) throw new Error("Target page does not belong to this exploration.");
  }
  const last = await prisma.explorationBlockOption.findFirst({ where: { blockId }, orderBy: { position: "desc" } });
  const effects = effectsFromFields(
    formData.get("effectVariable"),
    formData.get("effectOperation"),
    formData.get("effectValue")
  );
  await prisma.explorationBlockOption.create({
    data: {
      blockId,
      label,
      value,
      feedbackMarkdown,
      feedbackHtml: feedbackMarkdown ? await renderMarkdownContent(feedbackMarkdown) : null,
      isCorrect: block.kind === ExplorationBlockKind.QUIZ ? formData.get("isCorrect") === "on" : null,
      toPageId,
      effects: effects ? jsonInput(effects) : Prisma.JsonNull,
      position: (last?.position ?? 0) + 1
    }
  });
  revalidateExploration(exploration.slug);
}

export async function updateExplorationOptionAction(optionId: number, formData: FormData) {
  const option = await prisma.explorationBlockOption.findUnique({ where: { id: optionId }, select: { blockId: true } });
  if (!option) throw new Error("Option not found.");
  const { block, exploration } = await requireBlockEditor(option.blockId);
  const label = requiredBoundedText(formData.get("label"), CONTENT_LIMITS.shortText, "Option label");
  const feedbackMarkdown = boundedText(formData.get("feedbackMarkdown"), CONTENT_LIMITS.longNote, "Feedback") || null;
  const toPageId = Number(formData.get("toPageId")) || null;
  if (toPageId) {
    const target = await prisma.explorationPage.findFirst({ where: { id: toPageId, playlistId: exploration.id } });
    if (!target) throw new Error("Target page does not belong to this exploration.");
  }
  const effects = effectsFromFields(
    formData.get("effectVariable"),
    formData.get("effectOperation"),
    formData.get("effectValue")
  );
  await prisma.explorationBlockOption.update({
    where: { id: optionId },
    data: {
      label,
      value: boundedText(formData.get("value"), CONTENT_LIMITS.shortText, "Option value") || null,
      feedbackMarkdown,
      feedbackHtml: feedbackMarkdown ? await renderMarkdownContent(feedbackMarkdown) : null,
      isCorrect: block.kind === ExplorationBlockKind.QUIZ ? formData.get("isCorrect") === "on" : null,
      toPageId,
      effects: effects ? jsonInput(effects) : Prisma.JsonNull
    }
  });
  revalidateExploration(exploration.slug);
}

export async function deleteExplorationOptionAction(optionId: number) {
  const option = await prisma.explorationBlockOption.findUnique({ where: { id: optionId }, select: { blockId: true } });
  if (!option) return;
  const { exploration } = await requireBlockEditor(option.blockId);
  await prisma.explorationBlockOption.delete({ where: { id: optionId } });
  revalidateExploration(exploration.slug);
}

export async function addExplorationCollaboratorAction(playlistId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  const exploration = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!exploration) throw new Error("Exploration not found.");
  if (exploration.authorId !== user.id && !hasAdminPrivileges(user.role)) {
    throw new Error("Only the owner can manage collaborators.");
  }
  const username = ensureSlug(String(formData.get("username") ?? ""));
  const collaborator = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!collaborator) throw new Error("User not found.");
  if (collaborator.id === exploration.authorId) throw new Error("The owner is already part of this exploration.");
  const role = enumValue(
    Object.values(ExplorationCollaboratorRole),
    formData.get("role"),
    ExplorationCollaboratorRole.EDITOR
  );
  await prisma.explorationCollaborator.upsert({
    where: { playlistId_userId: { playlistId, userId: collaborator.id } },
    update: { role },
    create: { playlistId, userId: collaborator.id, role }
  });
  revalidateExploration(exploration.slug);
}

export async function removeExplorationCollaboratorAction(playlistId: number, collaboratorId: number) {
  const user = await requireVerifiedUser();
  const exploration = await prisma.playlist.findUnique({ where: { id: playlistId } });
  if (!exploration) return;
  if (exploration.authorId !== user.id && !hasAdminPrivileges(user.role)) {
    throw new Error("Only the owner can manage collaborators.");
  }
  await prisma.explorationCollaborator.deleteMany({ where: { playlistId, userId: collaboratorId } });
  revalidateExploration(exploration.slug);
}

export async function cloneExplorationTranslationAction(playlistId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  const targetLanguage = parseContentLanguage(formData.get("language"));
  const source = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: {
      collaborators: true,
      pages: {
        orderBy: { position: "asc" },
        include: {
          blocks: {
            orderBy: { position: "asc" },
            include: {
              problem: { select: { id: true, translationGroupId: true } },
              concept: { select: { id: true, translationGroupId: true } },
              options: { orderBy: { position: "asc" } }
            }
          }
        }
      }
    }
  });
  if (!source || !canViewExploration(user, source)) throw new Error("Exploration not found.");
  if (source.language === targetLanguage) throw new Error("Choose a different language.");
  const existing = await prisma.playlist.findFirst({
    where: { translationGroupId: source.translationGroupId, language: targetLanguage },
    select: { slug: true }
  });
  if (existing) redirect(`/explorations/${existing.slug}` as Route);

  const problemGroups = source.pages.flatMap((page) => page.blocks.flatMap((block) => block.problem?.translationGroupId ?? []));
  const conceptGroups = source.pages.flatMap((page) => page.blocks.flatMap((block) => block.concept?.translationGroupId ?? []));
  const [translatedProblems, translatedConcepts] = await Promise.all([
    prisma.problem.findMany({
      where: { language: targetLanguage, translationGroupId: { in: problemGroups } },
      select: { id: true, translationGroupId: true }
    }),
    prisma.concept.findMany({
      where: { language: targetLanguage, translationGroupId: { in: conceptGroups } },
      select: { id: true, translationGroupId: true }
    })
  ]);
  const problemByGroup = new Map(translatedProblems.map((problem) => [problem.translationGroupId, problem.id]));
  const conceptByGroup = new Map(translatedConcepts.map((concept) => [concept.translationGroupId, concept.id]));
  const slug = await uniqueSlug("playlist", `${source.title}-${targetLanguage}`);

  const translated = await prisma.$transaction(async (tx) => {
    const created = await tx.playlist.create({
      data: {
        slug,
        language: targetLanguage,
        translationGroupId: source.translationGroupId,
        title: source.title,
        summary: source.summary,
        descriptionMarkdown: source.descriptionMarkdown,
        descriptionHtml: source.descriptionHtml,
        coverImageUrl: source.coverImageUrl,
        domain: source.domain,
        audience: source.audience,
        prerequisitesMarkdown: source.prerequisitesMarkdown,
        prerequisitesHtml: source.prerequisitesHtml,
        estimatedMinutes: source.estimatedMinutes,
        difficulty: source.difficulty,
        license: source.license,
        authorId: user.id,
        visibility: PlaylistVisibility.PRIVATE,
        status: ExplorationStatus.DRAFT
      }
    });
    const pageIds = new Map<number, number>();
    const blockIds = new Map<number, number>();
    for (const page of source.pages) {
      const nextPage = await tx.explorationPage.create({
        data: {
          playlistId: created.id,
          key: page.key,
          slug: page.slug,
          title: page.title,
          summary: page.summary,
          position: page.position,
          isStart: page.isStart,
          isEnd: page.isEnd,
          visibilityRule: page.visibilityRule ? jsonInput(page.visibilityRule) : Prisma.JsonNull
        }
      });
      pageIds.set(page.id, nextPage.id);
      for (const block of page.blocks) {
        const nextBlock = await tx.explorationBlock.create({
          data: {
            pageId: nextPage.id,
            key: block.key,
            kind: block.kind,
            title: block.title,
            bodyMarkdown: block.bodyMarkdown,
            bodyHtml: block.bodyHtml,
            explanationMarkdown: block.explanationMarkdown,
            explanationHtml: block.explanationHtml,
            position: block.position,
            problemId: block.problem
              ? problemByGroup.get(block.problem.translationGroupId) ?? block.problem.id
              : null,
            conceptId: block.concept
              ? conceptByGroup.get(block.concept.translationGroupId) ?? block.concept.id
              : null,
            quizType: block.quizType,
            settings: block.settings ? jsonInput(block.settings) : Prisma.JsonNull,
            visibilityRule: block.visibilityRule ? jsonInput(block.visibilityRule) : Prisma.JsonNull,
            required: block.required,
            points: block.points
          }
        });
        blockIds.set(block.id, nextBlock.id);
      }
    }
    for (const page of source.pages) {
      for (const block of page.blocks) {
        const nextBlockId = blockIds.get(block.id)!;
        for (const option of block.options) {
          await tx.explorationBlockOption.create({
            data: {
              blockId: nextBlockId,
              label: option.label,
              value: option.value,
              feedbackMarkdown: option.feedbackMarkdown,
              feedbackHtml: option.feedbackHtml,
              isCorrect: option.isCorrect,
              toPageId: option.toPageId ? pageIds.get(option.toPageId) ?? null : null,
              effects: option.effects ? jsonInput(option.effects) : Prisma.JsonNull,
              position: option.position
            }
          });
        }
      }
    }
    return created;
  });

  revalidateExploration(source.slug);
  redirect(`/explorations/${translated.slug}/edit` as Route);
}

async function explorationSnapshot(playlistId: number) {
  const exploration = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: {
      author: { select: { username: true, displayName: true } },
      collaborators: { include: { user: { select: { username: true, displayName: true } } } },
      pages: {
        orderBy: { position: "asc" },
        include: {
          blocks: {
            orderBy: { position: "asc" },
            include: {
              problem: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  difficulty: true,
                  authorId: true,
                  qualityStatus: true,
                  translationGroupId: true
                }
              },
              concept: { select: { id: true, slug: true, title: true, translationGroupId: true } },
              options: { orderBy: { position: "asc" } }
            }
          }
        }
      }
    }
  });
  if (!exploration) throw new Error("Exploration not found.");
  return exploration;
}

export async function publishExplorationAction(playlistId: number, formData: FormData) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
  const snapshot = await explorationSnapshot(playlistId);
  if (snapshot.pages.length === 0) throw new Error("Add at least one page before publishing.");
  const changeSummary = boundedText(formData.get("changeSummary"), CONTENT_LIMITS.shortText, "Change summary") || null;
  const latest = await prisma.explorationEdition.findFirst({ where: { playlistId }, orderBy: { version: "desc" } });
  const publishedAt = new Date();

  await prisma.$transaction([
    prisma.explorationEdition.create({
      data: {
        playlistId,
        version: (latest?.version ?? 0) + 1,
        snapshot: jsonInput(snapshot),
        changeSummary,
        publishedById: user.id,
        publishedAt
      }
    }),
    prisma.playlist.update({
      where: { id: playlistId },
      data: { status: ExplorationStatus.PUBLISHED, publishedAt }
    })
  ]);

  const followers = await prisma.playlistFollow.findMany({ where: { playlistId }, select: { userId: true } });
  await Promise.all(
    followers.map(({ userId }) =>
      createNotification({
        userId,
        actorId: user.id,
        type: NotificationType.EXPLORATION_PUBLISHED,
        title: `New edition of ${exploration.title}`,
        body: changeSummary || "A new edition is ready to explore.",
        href: `/explorations/${exploration.slug}`
      })
    )
  );
  revalidateExploration(exploration.slug);
}

export async function changeExplorationStatusAction(playlistId: number, status: ExplorationStatus) {
  const { exploration } = await requireExplorationEditor(playlistId);
  if (status === ExplorationStatus.PUBLISHED) throw new Error("Use Publish to create a versioned edition.");
  if (!Object.values(ExplorationStatus).includes(status)) throw new Error("Invalid exploration status.");
  await prisma.playlist.update({ where: { id: playlistId }, data: { status } });
  revalidateExploration(exploration.slug);
}

type QuizSettings = { expectedAnswer?: unknown; tolerance?: unknown; caseSensitive?: boolean };

export async function submitExplorationResponseAction(
  playlistId: number,
  editionId: number | null,
  pageKey: string,
  blockKey: string,
  response: unknown,
  persistResponse = true
) {
  const user = await getCurrentUser();
  const exploration = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { collaborators: true }
  });
  if (!exploration || !canViewExploration(user, exploration)) throw new Error("Exploration block not found.");

  const previousSession = user && persistResponse
    ? await prisma.explorationSession.findUnique({
        where: { playlistId_userId: { playlistId, userId: user.id } }
      })
    : null;
  if (previousSession?.editionId && editionId && previousSession.editionId !== editionId) {
    throw new Error("This response belongs to a different published edition.");
  }

  const edition = editionId
    ? await prisma.explorationEdition.findFirst({ where: { id: editionId, playlistId } })
    : null;
  const snapshotMatch = edition ? findSnapshotBlock(edition.snapshot, pageKey, blockKey) : null;
  const liveBlock = await prisma.explorationBlock.findFirst({
    where: { key: blockKey, page: { key: pageKey, playlistId } },
    include: { options: { orderBy: { position: "asc" } }, page: true }
  });
  const block = snapshotMatch?.block ?? liveBlock;
  const sourcePage = snapshotMatch?.page ?? liveBlock?.page;
  if (!block || !sourcePage) throw new Error("Exploration block not found.");
  if (block.kind !== ExplorationBlockKind.QUIZ && block.kind !== ExplorationBlockKind.CHOICE) {
    throw new Error("This block does not accept a response.");
  }

  const optionIds = Array.isArray(response) ? response.map(Number).filter(Number.isInteger) : [Number(response)].filter(Number.isInteger);
  const selectedOptions = block.options.filter((option) => optionIds.includes(option.id));
  let isCorrect: boolean | null = null;
  const settings = (block.settings && typeof block.settings === "object" ? block.settings : {}) as QuizSettings;

  if (block.kind === ExplorationBlockKind.QUIZ) {
    if (block.quizType === ExplorationQuizType.SHORT_TEXT) {
      isCorrect = normalizedTextAnswer(response, settings.caseSensitive) === normalizedTextAnswer(settings.expectedAnswer, settings.caseSensitive);
    } else if (block.quizType === ExplorationQuizType.NUMBER) {
      isCorrect = numericAnswerMatches(response, settings.expectedAnswer, settings.tolerance);
    } else if (block.quizType === ExplorationQuizType.MULTIPLE_CHOICE) {
      const correctIds = block.options.filter((option) => option.isCorrect).map((option) => option.id).sort((a, b) => a - b);
      const selectedIds = [...optionIds].sort((a, b) => a - b);
      isCorrect = correctIds.length === selectedIds.length && correctIds.every((id, index) => id === selectedIds[index]);
    } else {
      isCorrect = selectedOptions.length === 1 && selectedOptions[0]?.isCorrect === true;
    }
  }

  const selected = selectedOptions[0] ?? null;
  let state = asExplorationState(previousSession?.state);
  state = applyEffects(state, selectedOptions.flatMap((option) => Array.isArray(option.effects) ? option.effects : []));
  const stableBlockKey = `${pageKey}:${blockKey}`;
  state[`block.${stableBlockKey}.answered`] = true;
  if (isCorrect !== null) state[`block.${stableBlockKey}.correct`] = isCorrect;

  let score = isCorrect ? block.points : 0;
  if (user && persistResponse) {
    const effectiveEditionId = previousSession?.editionId ?? edition?.id ?? null;
    const sourcePages = edition ? explorationSnapshotPages(edition.snapshot) : [];
    const maxScore = edition
      ? sourcePages.reduce((total, page) => total + page.blocks.reduce((sum, item) => sum + (item.points || 0), 0), 0)
      : (await prisma.explorationBlock.aggregate({
          where: { page: { playlistId } },
          _sum: { points: true }
        }))._sum.points ?? 0;
    const targetPage = selected?.toPageId
      ? sourcePages.find((page) => page.id === selected.toPageId)
      : null;
    const selectedLivePage = !edition && selected?.toPageId
      ? await prisma.explorationPage.findFirst({
          where: { id: selected.toPageId, playlistId },
          select: { id: true, key: true }
        })
      : null;
    const targetPageKey = targetPage?.key ?? selectedLivePage?.key ?? pageKey;
    const targetLivePage = selectedLivePage ?? await prisma.explorationPage.findFirst({
      where: { playlistId, key: targetPageKey }, select: { id: true, key: true }
    });
    const visited = new Set<number>(
      Array.isArray(previousSession?.visitedPageIds)
        ? previousSession.visitedPageIds.map(Number).filter(Number.isInteger)
        : []
    );
    visited.add(sourcePage.id);
    const visitedKeys = new Set<string>(
      Array.isArray(previousSession?.visitedPageKeys)
        ? previousSession.visitedPageKeys.map(String)
        : []
    );
    visitedKeys.add(pageKey);
    const session = await prisma.explorationSession.upsert({
      where: { playlistId_userId: { playlistId, userId: user.id } },
      update: {
        currentPageId: targetLivePage?.id ?? liveBlock?.pageId ?? null,
        currentPageKey: targetPageKey,
        state: jsonInput(state),
        visitedPageIds: jsonInput([...visited]),
        visitedPageKeys: jsonInput([...visitedKeys]),
        maxScore,
        status: ExplorationSessionStatus.IN_PROGRESS
      },
      create: {
        playlistId,
        userId: user.id,
        editionId: effectiveEditionId,
        currentPageId: targetLivePage?.id ?? liveBlock?.pageId ?? null,
        currentPageKey: targetPageKey,
        state: jsonInput(state),
        visitedPageIds: jsonInput([...visited]),
        visitedPageKeys: jsonInput([...visitedKeys]),
        maxScore
      }
    });
    await prisma.explorationAnswer.upsert({
      where: { sessionId_blockKey: { sessionId: session.id, blockKey: stableBlockKey } },
      update: { blockId: liveBlock?.id ?? null, response: jsonInput(response ?? ""), isCorrect, score },
      create: {
        sessionId: session.id,
        blockId: liveBlock?.id ?? null,
        blockKey: stableBlockKey,
        response: jsonInput(response ?? ""),
        isCorrect,
        score
      }
    });
    const aggregate = await prisma.explorationAnswer.aggregate({ where: { sessionId: session.id }, _sum: { score: true } });
    score = aggregate._sum.score ?? 0;
    await prisma.explorationSession.update({ where: { id: session.id }, data: { score } });
  }

  return {
    isCorrect,
    feedbackHtml: selected?.feedbackHtml ?? block.explanationHtml ?? null,
    nextPageId: selected?.toPageId ?? null,
    state,
    score
  };
}

export async function saveExplorationProgressAction(
  playlistId: number,
  editionId: number | null,
  pageId: number,
  pageKey: string,
  rawState: ExplorationState,
  completed = false
) {
  const user = await getCurrentUser();
  if (!user) return { saved: false };
  const exploration = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { collaborators: true, pages: { select: { id: true, key: true } } }
  });
  if (!exploration || !canViewExploration(user, exploration)) throw new Error("Exploration not found.");
  const existing = await prisma.explorationSession.findUnique({
    where: { playlistId_userId: { playlistId, userId: user.id } }
  });
  const effectiveEditionId = existing?.editionId ?? editionId;
  const edition = effectiveEditionId
    ? await prisma.explorationEdition.findFirst({ where: { id: effectiveEditionId, playlistId } })
    : null;
  const validSnapshotPage = edition
    ? explorationSnapshotPages(edition.snapshot).some((page) => page.id === pageId && page.key === pageKey)
    : false;
  const livePage = exploration.pages.find((page) => page.key === pageKey);
  if (!validSnapshotPage && !livePage) throw new Error("Invalid exploration page.");
  const visited = new Set<number>(
    Array.isArray(existing?.visitedPageIds) ? existing.visitedPageIds.map(Number).filter(Number.isInteger) : []
  );
  visited.add(pageId);
  const visitedKeys = new Set<string>(
    Array.isArray(existing?.visitedPageKeys) ? existing.visitedPageKeys.map(String) : []
  );
  visitedKeys.add(pageKey);
  const latestEdition = effectiveEditionId ? null : await prisma.explorationEdition.findFirst({
    where: { playlistId }, orderBy: { version: "desc" }, select: { id: true }
  });
  await prisma.explorationSession.upsert({
    where: { playlistId_userId: { playlistId, userId: user.id } },
    update: {
      currentPageId: livePage?.id ?? null,
      currentPageKey: pageKey,
      state: jsonInput(asExplorationState(rawState)),
      visitedPageIds: jsonInput([...visited]),
      visitedPageKeys: jsonInput([...visitedKeys]),
      status: completed ? ExplorationSessionStatus.COMPLETED : ExplorationSessionStatus.IN_PROGRESS,
      completedAt: completed ? new Date() : null
    },
    create: {
      playlistId,
      userId: user.id,
      editionId: effectiveEditionId ?? latestEdition?.id ?? null,
      currentPageId: livePage?.id ?? null,
      currentPageKey: pageKey,
      state: jsonInput(asExplorationState(rawState)),
      visitedPageIds: jsonInput([...visited]),
      visitedPageKeys: jsonInput([...visitedKeys]),
      status: completed ? ExplorationSessionStatus.COMPLETED : ExplorationSessionStatus.IN_PROGRESS,
      completedAt: completed ? new Date() : null
    }
  });
  revalidatePath(`/explorations/${exploration.slug}`);
  return { saved: true };
}
