"use server";

import {
  ExplorationBlockKind,
  ExplorationCollaboratorRole,
  ExplorationOutcomeKind,
  ExplorationOptionAction,
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
import { resolveExplorationQuizOutcome } from "@/lib/exploration-routing";
import { nextExplorationBlockId } from "@/lib/exploration-block-graph";
import {
  clearExplorationBranches,
  explorationBranchStateKey
} from "@/lib/exploration-branches";
import {
  canEditExploration,
  canReviewExploration,
  canViewExploration,
  clampOptionalInteger
} from "@/lib/explorations";
import { shouldCoalesceExplorationChange } from "@/lib/exploration-history";
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

async function requireOutcomeEditor(outcomeId: number) {
  const outcome = await prisma.explorationBlockOutcome.findUnique({
    where: { id: outcomeId },
    include: { matches: true }
  });
  if (!outcome) throw new Error("Quiz route not found.");
  const context = await requireBlockEditor(outcome.blockId);
  return { ...context, outcome };
}

async function requireBranchEditor(branchId: number) {
  const branch = await prisma.explorationBranch.findUnique({
    where: { id: branchId },
    include: {
      page: { include: { playlist: { include: { collaborators: true } } } },
      sourceOption: { select: { id: true } }
    }
  });
  if (!branch) throw new Error("Exploration branch not found.");
  const user = await requireVerifiedUser();
  if (!canEditExploration(user, branch.page.playlist)) throw new Error("You cannot edit this exploration.");
  return { user, branch, page: branch.page, exploration: branch.page.playlist };
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
          position: 1,
          canvasX: 0,
          canvasY: 0,
          isStart: true,
          isEnd: true
        }
      });
    } else {
      await tx.explorationBlock.create({
        data: {
          pageId: page.id,
          kind: ExplorationBlockKind.MARKDOWN,
          position: 1,
          canvasX: 0,
          canvasY: 0,
          isStart: true,
          isEnd: true
        }
      });
    }
    return created;
  });

  await recordExplorationChange(exploration.id, user.id, "Created exploration");
  revalidateExploration(exploration.slug);
  redirect(`/explorations/${exploration.slug}/edit` as Route);
}

export async function updateExplorationMetadataAction(playlistId: number, formData: FormData) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
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

  await recordExplorationChange(playlistId, user.id, "Updated exploration details");
  revalidateExploration(exploration.slug, { editor: false });
}

export async function createExplorationPageAction(playlistId: number, formData: FormData) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
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
        canvasX: last?.canvasX === null || last?.canvasX === undefined ? 0 : last.canvasX + 320,
        canvasY: last?.canvasY ?? 0,
        visibilityRule: ruleFromForm(formData) ? jsonInput(ruleFromForm(formData)) : Prisma.JsonNull
      }
    });
  });

  await recordExplorationChange(playlistId, user.id, `Added page "${page.title}"`);
  // The editor is force-dynamic and the client navigates to the new page itself.
  // Avoid refreshing the current studio before that soft navigation completes.
  revalidateExploration(exploration.slug, { editor: false });
  return {
    pageId: page.id,
    slug: page.slug,
    title: page.title,
    position: page.position,
    isStart: page.isStart,
    canvasX: page.canvasX,
    canvasY: page.canvasY
  };
}

export async function updateExplorationPageAction(pageId: number, formData: FormData) {
  const { user, page, exploration } = await requirePageEditor(pageId);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Page title");
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
        slug,
        isStart: isStart || page.isStart,
        isEnd: isEnd || page.isEnd,
        visibilityRule: rule ? jsonInput(rule) : Prisma.JsonNull
      }
    });
  });
  await recordExplorationChange(page.playlistId, user.id, `Updated page "${title}"`);
  revalidateExploration(exploration.slug, { editor: false });
}

export async function setExplorationPagePositionAction(pageId: number, requestedPosition: number) {
  const { user, page, exploration } = await requirePageEditor(pageId);
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
  await recordExplorationChange(page.playlistId, user.id, `Reordered page "${page.title}"`);
  revalidateExploration(exploration.slug, { editor: false });
  return { position };
}

type ExplorationCanvasPosition = { pageId: number; x: number; y: number };
type ExplorationBlockCanvasPosition = { blockId: number; x: number; y: number };
export type ExplorationMapHistoryBlock = {
  id: number;
  canvasX: number | null;
  canvasY: number | null;
  isStart: boolean;
  isEnd: boolean;
  continueToBlockId: number | null;
  autoContinue: boolean;
  name: string | null;
  options: Array<{ id: number; toBlockId: number | null }>;
  outcomes: Array<{ id: number; toBlockId: number | null }>;
};

function canvasCoordinate(value: number) {
  if (!Number.isFinite(value)) throw new Error("Invalid canvas position.");
  return Math.max(-100000, Math.min(100000, Math.round(value * 10) / 10));
}

export async function updateExplorationCanvasPositionsAction(
  playlistId: number,
  positions: ExplorationCanvasPosition[]
) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
  if (!Array.isArray(positions) || positions.length === 0 || positions.length > 1000) {
    throw new Error("Invalid canvas positions.");
  }
  const normalized = positions.map((position) => ({
    pageId: Number(position.pageId),
    x: canvasCoordinate(Number(position.x)),
    y: canvasCoordinate(Number(position.y))
  }));
  const pageIds = [...new Set(normalized.map((position) => position.pageId))];
  if (pageIds.some((id) => !Number.isInteger(id))) throw new Error("Invalid exploration page.");
  const matchingPages = await prisma.explorationPage.count({
    where: { playlistId, id: { in: pageIds } }
  });
  if (matchingPages !== pageIds.length) throw new Error("A page does not belong to this exploration.");

  await prisma.$transaction(
    normalized.map((position) => prisma.explorationPage.update({
      where: { id: position.pageId },
      data: { canvasX: position.x, canvasY: position.y }
    }))
  );
  await recordExplorationChange(playlistId, user.id, "Rearranged exploration map");
  revalidateExploration(exploration.slug, { editor: false });
  return normalized;
}

export async function createExplorationGraphBlockAction(playlistId: number, formData: FormData) {
  const { exploration } = await requireExplorationEditor(playlistId);
  const mapPlacement = formData.get("mapPlacement") === "true";
  let workspacePage = await prisma.explorationPage.findFirst({
    where: { playlistId },
    orderBy: [{ position: "asc" }, { id: "asc" }]
  });
  if (!workspacePage) {
    workspacePage = await prisma.explorationPage.create({
      data: {
        playlistId,
        slug: "blocks",
        title: exploration.title,
        position: 1,
        isStart: true,
        isEnd: true
      }
    });
  }
  const [terminal, count] = await Promise.all([
    mapPlacement ? null : prisma.explorationBlock.findFirst({
      where: { page: { playlistId }, isEnd: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    }),
    prisma.explorationBlock.count({ where: { page: { playlistId } } })
  ]);
  const { blockId } = await createExplorationBlockAction(workspacePage.id, formData);
  const column = count % 4;
  const row = Math.floor(count / 4);
  await prisma.$transaction(async (tx) => {
    if (terminal) {
      await tx.explorationBlock.update({
        where: { id: terminal.id },
        data: { continueToBlockId: blockId, isEnd: false }
      });
    }
    await tx.explorationBlock.update({
      where: { id: blockId },
      data: {
        canvasX: column * 320,
        canvasY: row * 220,
        position: count + 1,
        isStart: count === 0,
        isEnd: mapPlacement ? count === 0 : true
      }
    });
  });
  revalidateExploration(exploration.slug, { editor: false });
  return { blockId };
}

export async function updateExplorationBlockCanvasPositionsAction(
  playlistId: number,
  positions: ExplorationBlockCanvasPosition[]
) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
  if (!Array.isArray(positions) || positions.length === 0 || positions.length > 2000) {
    throw new Error("Invalid canvas positions.");
  }
  const normalized = positions.map((position) => ({
    blockId: Number(position.blockId),
    x: canvasCoordinate(Number(position.x)),
    y: canvasCoordinate(Number(position.y))
  }));
  const blockIds = [...new Set(normalized.map((position) => position.blockId))];
  if (blockIds.some((id) => !Number.isInteger(id))) throw new Error("Invalid exploration block.");
  const matchingBlocks = await prisma.explorationBlock.count({
    where: { id: { in: blockIds }, page: { playlistId } }
  });
  if (matchingBlocks !== blockIds.length) throw new Error("A block does not belong to this exploration.");
  await prisma.$transaction(normalized.map((position) => prisma.explorationBlock.update({
    where: { id: position.blockId },
    data: { canvasX: position.x, canvasY: position.y }
  })));
  await recordExplorationChange(playlistId, user.id, "Moved exploration blocks");
  revalidateExploration(exploration.slug, { editor: false });
  return normalized;
}

export async function restoreExplorationMapStateAction(
  playlistId: number,
  state: ExplorationMapHistoryBlock[],
  direction: "undo" | "redo"
) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
  if (!Array.isArray(state) || state.length === 0 || state.length > 2000) {
    throw new Error("Invalid exploration map history.");
  }
  const existing = await prisma.explorationBlock.findMany({
    where: { page: { playlistId } },
    select: {
      id: true,
      options: { select: { id: true } },
      outcomes: { select: { id: true } }
    }
  });
  const blockIds = new Set(existing.map((block) => block.id));
  const existingById = new Map(existing.map((block) => [block.id, block]));
  const submittedIds = state.map((block) => Number(block.id));
  if (
    state.length !== existing.length ||
    new Set(submittedIds).size !== existing.length ||
    submittedIds.some((id) => !blockIds.has(id))
  ) {
    throw new Error("The exploration structure changed. Undo history was cleared.");
  }
  if (state.filter((block) => block.isStart).length > 1 || state.filter((block) => block.isEnd).length > 1) {
    throw new Error("Invalid exploration endpoints.");
  }
  const normalized = state.map((block) => {
    const source = existingById.get(block.id);
    if (!source) throw new Error("Invalid exploration block.");
    if (!Array.isArray(block.options) || !Array.isArray(block.outcomes)) {
      throw new Error("Invalid exploration paths.");
    }
    const optionIds = new Set(source.options.map((option) => option.id));
    const outcomeIds = new Set(source.outcomes.map((outcome) => outcome.id));
    if (
      block.options.length !== optionIds.size ||
      new Set(block.options.map((option) => option.id)).size !== optionIds.size ||
      block.options.some((option) => !optionIds.has(option.id)) ||
      block.outcomes.length !== outcomeIds.size ||
      new Set(block.outcomes.map((outcome) => outcome.id)).size !== outcomeIds.size ||
      block.outcomes.some((outcome) => !outcomeIds.has(outcome.id))
    ) {
      throw new Error("The exploration paths changed. Undo history was cleared.");
    }
    const target = (value: number | null, allowSelf = true) => {
      if (value === null) return null;
      const id = Number(value);
      if (!Number.isInteger(id) || !blockIds.has(id)) throw new Error("Invalid map link.");
      if (!allowSelf && id === block.id) throw new Error("A block cannot link to itself.");
      return id;
    };
    return {
      id: block.id,
      canvasX: block.canvasX === null ? null : canvasCoordinate(Number(block.canvasX)),
      canvasY: block.canvasY === null ? null : canvasCoordinate(Number(block.canvasY)),
      isStart: block.isStart === true,
      isEnd: block.isEnd === true,
      continueToBlockId: block.isEnd ? null : target(block.continueToBlockId, false),
      autoContinue: block.isEnd || block.continueToBlockId === null ? false : block.autoContinue === true,
      name: boundedText(block.name, CONTENT_LIMITS.title, "Block name") || null,
      options: block.options.map((option) => ({ id: option.id, toBlockId: target(option.toBlockId, false) })),
      outcomes: block.outcomes.map((outcome) => ({ id: outcome.id, toBlockId: target(outcome.toBlockId) }))
    };
  });

  await prisma.$transaction(async (tx) => {
    for (const block of normalized) {
      await tx.explorationBlock.update({
        where: { id: block.id },
        data: {
          canvasX: block.canvasX,
          canvasY: block.canvasY,
          isStart: block.isStart,
          isEnd: block.isEnd,
          continueToBlockId: block.continueToBlockId,
          autoContinue: block.autoContinue,
          name: block.name
        }
      });
      for (const option of block.options) {
        await tx.explorationBlockOption.update({
          where: { id: option.id },
          data: {
            action: option.toBlockId === null ? ExplorationOptionAction.STAY : ExplorationOptionAction.PAGE,
            toBlockId: option.toBlockId,
            toPageId: null
          }
        });
      }
      for (const outcome of block.outcomes) {
        await tx.explorationBlockOutcome.update({
          where: { id: outcome.id },
          data: { toBlockId: outcome.toBlockId, toPageId: null }
        });
      }
    }
  });
  await recordExplorationChange(playlistId, user.id, direction === "undo" ? "Undid a map change" : "Redid a map change");
  revalidateExploration(exploration.slug, { editor: false });
}

export async function setExplorationBlockContinueAction(
  blockId: number,
  targetBlockId: number | null,
  autoContinue?: boolean
) {
  const { user, block, page, exploration } = await requireBlockEditor(blockId);
  const normalizedTarget = targetBlockId === null ? null : Number(targetBlockId);
  if (normalizedTarget === blockId) throw new Error("A block cannot continue to itself.");
  if (normalizedTarget !== null) {
    const target = await prisma.explorationBlock.findFirst({
      where: { id: normalizedTarget, page: { playlistId: page.playlistId } },
      select: { id: true }
    });
    if (!target) throw new Error("The target block does not belong to this exploration.");
  }
  await prisma.explorationBlock.update({
    where: { id: block.id },
    data: {
      continueToBlockId: normalizedTarget,
      isEnd: normalizedTarget === null ? block.isEnd : false,
      ...(normalizedTarget === null
        ? { autoContinue: false }
        : autoContinue === undefined
          ? {}
          : { autoContinue })
    }
  });
  await recordExplorationChange(page.playlistId, user.id, "Updated a block link");
  revalidateExploration(exploration.slug, { editor: false });
  return { blockId, targetBlockId: normalizedTarget };
}

export async function updateExplorationBlockContinueFormAction(blockId: number, formData: FormData) {
  const targetBlockId = Number(formData.get("continueToBlockId")) || null;
  return setExplorationBlockContinueAction(blockId, targetBlockId, formData.get("autoContinue") === "on");
}

export async function setExplorationBlockEndpointAction(blockId: number, endpoint: "start" | "end") {
  const { user, page, exploration } = await requireBlockEditor(blockId);
  await prisma.$transaction(async (tx) => {
    await tx.explorationBlock.updateMany({
      where: { page: { playlistId: page.playlistId } },
      data: endpoint === "start" ? { isStart: false } : { isEnd: false }
    });
    await tx.explorationBlock.update({
      where: { id: blockId },
      data: endpoint === "start"
        ? { isStart: true }
        : { isEnd: true, continueToBlockId: null, autoContinue: false }
    });
  });
  await recordExplorationChange(page.playlistId, user.id, `Changed exploration ${endpoint} block`);
  revalidateExploration(exploration.slug, { editor: false });
}

export async function setExplorationChoiceBlockTargetAction(optionId: number, targetBlockId: number | null) {
  const option = await prisma.explorationBlockOption.findUnique({
    where: { id: optionId },
    select: { blockId: true }
  });
  if (!option) throw new Error("Choice not found.");
  const { user, block, page, exploration } = await requireBlockEditor(option.blockId);
  if (block.kind !== ExplorationBlockKind.CHOICE) throw new Error("This option is not a choice path.");
  const normalizedTarget = targetBlockId === null ? null : Number(targetBlockId);
  if (normalizedTarget === block.id) throw new Error("A choice cannot link to its own block.");
  if (normalizedTarget !== null) {
    const target = await prisma.explorationBlock.findFirst({
      where: { id: normalizedTarget, page: { playlistId: page.playlistId } },
      select: { id: true }
    });
    if (!target) throw new Error("The target block does not belong to this exploration.");
  }
  await prisma.explorationBlockOption.update({
    where: { id: optionId },
    data: {
      action: normalizedTarget === null ? ExplorationOptionAction.STAY : ExplorationOptionAction.PAGE,
      toBlockId: normalizedTarget,
      toPageId: null
    }
  });
  await recordExplorationChange(page.playlistId, user.id, "Updated a choice link");
  revalidateExploration(exploration.slug, { editor: false });
}

export async function setExplorationQuizOutcomeBlockTargetAction(outcomeId: number, targetBlockId: number | null) {
  const { user, outcome, page, exploration } = await requireOutcomeEditor(outcomeId);
  const normalizedTarget = targetBlockId === null ? null : Number(targetBlockId);
  if (normalizedTarget !== null) {
    const target = await prisma.explorationBlock.findFirst({
      where: { id: normalizedTarget, page: { playlistId: page.playlistId } },
      select: { id: true }
    });
    if (!target) throw new Error("The target block does not belong to this exploration.");
  }
  await prisma.explorationBlockOutcome.update({
    where: { id: outcome.id },
    data: { toBlockId: normalizedTarget, toPageId: null }
  });
  await recordExplorationChange(page.playlistId, user.id, "Updated a quiz link");
  revalidateExploration(exploration.slug, { editor: false });
}

export async function setExplorationContinueAction(pageId: number, targetPageId: number | null) {
  const { user, page, exploration } = await requirePageEditor(pageId);
  const normalizedTarget = targetPageId === null ? null : Number(targetPageId);
  if (normalizedTarget !== null) {
    if (!Number.isInteger(normalizedTarget)) throw new Error("Invalid target page.");
    const target = await prisma.explorationPage.findFirst({
      where: { id: normalizedTarget, playlistId: page.playlistId },
      select: { id: true }
    });
    if (!target) throw new Error("The target page does not belong to this exploration.");
  }
  await prisma.explorationPage.update({
    where: { id: pageId },
    data: { continueToPageId: normalizedTarget }
  });
  await recordExplorationChange(page.playlistId, user.id, `Updated Continue link from "${page.title}"`);
  revalidateExploration(exploration.slug, { editor: false });
  return { pageId, targetPageId: normalizedTarget };
}

export async function createExplorationCanvasChoiceAction(
  pageId: number,
  targetPageId: number,
  rawLabel: string
) {
  const { user, page, exploration } = await requirePageEditor(pageId);
  const label = requiredBoundedText(rawLabel, CONTENT_LIMITS.shortText, "Choice label");
  const normalizedTarget = Number(targetPageId);
  if (!Number.isInteger(normalizedTarget)) throw new Error("Invalid target page.");
  const target = await prisma.explorationPage.findFirst({
    where: { id: normalizedTarget, playlistId: page.playlistId },
    select: { id: true }
  });
  if (!target) throw new Error("The target page does not belong to this exploration.");

  const result = await prisma.$transaction(async (tx) => {
    let blockCreated = false;
    let block = await tx.explorationBlock.findFirst({
      where: { pageId, kind: ExplorationBlockKind.CHOICE },
      orderBy: { position: "asc" },
      select: { id: true }
    });
    if (!block) {
      blockCreated = true;
      const lastBlock = await tx.explorationBlock.findFirst({ where: { pageId }, orderBy: { position: "desc" } });
      block = await tx.explorationBlock.create({
        data: {
          pageId,
          kind: ExplorationBlockKind.CHOICE,
          required: true,
          position: (lastBlock?.position ?? 0) + 1
        },
        select: { id: true }
      });
    }
    const lastOption = await tx.explorationBlockOption.findFirst({
      where: { blockId: block.id },
      orderBy: { position: "desc" }
    });
    const option = await tx.explorationBlockOption.create({
      data: {
        blockId: block.id,
        action: ExplorationOptionAction.PAGE,
        label,
        position: (lastOption?.position ?? 0) + 1,
        toPageId: target.id
      }
    });
    return { blockCreated, blockId: block.id, optionId: option.id };
  });
  await recordExplorationChange(page.playlistId, user.id, `Added path from "${page.title}"`);
  revalidateExploration(exploration.slug, { editor: false });
  return { ...result, pageId, targetPageId: target.id, label };
}

export async function updateExplorationCanvasChoiceAction(
  optionId: number,
  rawLabel: string,
  targetPageId: number | null,
  rawAction: string = ExplorationOptionAction.PAGE
) {
  const option = await prisma.explorationBlockOption.findUnique({
    where: { id: optionId },
    select: { blockId: true, revealBranchId: true }
  });
  if (!option) throw new Error("Choice not found.");
  const { user, block, page, exploration } = await requireBlockEditor(option.blockId);
  if (block.kind !== ExplorationBlockKind.CHOICE) throw new Error("This option is not an exploration path.");
  const label = requiredBoundedText(rawLabel, CONTENT_LIMITS.shortText, "Choice label");
  const action = Object.values(ExplorationOptionAction).includes(rawAction as ExplorationOptionAction)
    ? rawAction as ExplorationOptionAction
    : ExplorationOptionAction.STAY;
  const normalizedTarget = targetPageId === null ? null : Number(targetPageId);
  if (normalizedTarget !== null) {
    if (!Number.isInteger(normalizedTarget)) throw new Error("Invalid target page.");
    const target = await prisma.explorationPage.findFirst({
      where: { id: normalizedTarget, playlistId: page.playlistId },
      select: { id: true }
    });
    if (!target) throw new Error("The target page does not belong to this exploration.");
  }
  const result = await prisma.$transaction(async (tx) => {
    let revealBranchId = option.revealBranchId;
    let revealBlockCount = 0;
    if (action === ExplorationOptionAction.REVEAL && revealBranchId === null) {
      const branch = await tx.explorationBranch.create({
        data: { pageId: page.id, parentBranchId: block.branchId, label: `After "${label}"` }
      });
      revealBranchId = branch.id;
      await tx.explorationBlock.create({
        data: { pageId: page.id, branchId: branch.id, kind: ExplorationBlockKind.MARKDOWN, position: 1 }
      });
      revealBlockCount = 1;
    } else if (revealBranchId !== null) {
      await tx.explorationBranch.update({
        where: { id: revealBranchId },
        data: { label: `After "${label}"` }
      });
      revealBlockCount = await tx.explorationBlock.count({ where: { branchId: revealBranchId } });
    }
    await tx.explorationBlockOption.update({
      where: { id: optionId },
      data: { action, label, revealBranchId, toPageId: normalizedTarget }
    });
    return { revealBlockCount, revealBranchId };
  });
  await recordExplorationChange(page.playlistId, user.id, `Updated a path from "${page.title}"`);
  revalidateExploration(exploration.slug, { editor: false });
  return { ...result, action, optionId, pageId: page.id, targetPageId: normalizedTarget, label };
}

export async function createExplorationQuizOutcomeAction(
  blockId: number,
  rawKind: string,
  rawOptionIds: number[],
  targetPageId: number | null
) {
  const { user, block, page, exploration } = await requireBlockEditor(blockId);
  if (block.kind !== ExplorationBlockKind.QUIZ) throw new Error("Only quiz blocks accept quiz routes.");
  const kind = Object.values(ExplorationOutcomeKind).includes(rawKind as ExplorationOutcomeKind)
    ? rawKind as ExplorationOutcomeKind
    : null;
  if (!kind || kind === ExplorationOutcomeKind.ANSWER) throw new Error("Invalid quiz route type.");
  if (
    kind === ExplorationOutcomeKind.COMBINATION
    && block.quizType !== ExplorationQuizType.SINGLE_CHOICE
    && block.quizType !== ExplorationQuizType.MULTIPLE_CHOICE
    && block.quizType !== ExplorationQuizType.TRUE_FALSE
  ) {
    throw new Error("Exact-selection routes require a quiz with answer options.");
  }

  const optionIds = [...new Set(rawOptionIds.map(Number).filter(Number.isInteger))].sort((left, right) => left - right);
  const options = optionIds.length
    ? await prisma.explorationBlockOption.findMany({
        where: { blockId, id: { in: optionIds } },
        orderBy: { position: "asc" },
        select: { id: true, label: true }
      })
    : [];
  if (options.length !== optionIds.length) throw new Error("A selected answer does not belong to this quiz.");
  if (kind !== ExplorationOutcomeKind.COMBINATION && optionIds.length > 0) {
    throw new Error("Only exact-selection routes can contain answers.");
  }

  const normalizedTarget = targetPageId === null ? null : Number(targetPageId);
  if (normalizedTarget !== null) {
    if (!Number.isInteger(normalizedTarget)) throw new Error("Invalid target page.");
    const target = await prisma.explorationPage.findFirst({
      where: { id: normalizedTarget, playlistId: page.playlistId },
      select: { id: true }
    });
    if (!target) throw new Error("The target page does not belong to this exploration.");
  }

  const existing = await prisma.explorationBlockOutcome.findMany({
    where: { blockId },
    include: { matches: true },
    orderBy: { position: "asc" }
  });
  if (
    (kind === ExplorationOutcomeKind.CORRECT || kind === ExplorationOutcomeKind.INCORRECT)
    && existing.some((outcome) => outcome.kind === kind)
  ) {
    throw new Error(`${kind === ExplorationOutcomeKind.CORRECT ? "Correct" : "Incorrect"} already has a route.`);
  }
  if (kind === ExplorationOutcomeKind.COMBINATION && existing.some((outcome) => {
    if (outcome.kind !== ExplorationOutcomeKind.COMBINATION) return false;
    const existingIds = outcome.matches.map((match) => match.optionId).sort((left, right) => left - right);
    return existingIds.length === optionIds.length && existingIds.every((optionId, index) => optionId === optionIds[index]);
  })) {
    throw new Error("This exact answer selection already has a route.");
  }

  const label = kind === ExplorationOutcomeKind.CORRECT
    ? "Correct"
    : kind === ExplorationOutcomeKind.INCORRECT
      ? "Incorrect"
      : options.length
        ? options.map((option) => option.label).join(" + ")
        : "No answer selected";
  const outcome = await prisma.explorationBlockOutcome.create({
    data: {
      blockId,
      kind,
      label: label.slice(0, CONTENT_LIMITS.shortText),
      toPageId: normalizedTarget,
      position: (existing.at(-1)?.position ?? 0) + 1,
      matches: optionIds.length ? { create: optionIds.map((optionId) => ({ optionId })) } : undefined
    },
    include: { matches: true }
  });
  await recordExplorationChange(page.playlistId, user.id, `Added a quiz route from "${page.title}"`);
  revalidateExploration(exploration.slug, { editor: false });
  return {
    id: outcome.id,
    blockId,
    kind: outcome.kind,
    label: outcome.label,
    optionIds: outcome.matches.map((match) => match.optionId),
    position: outcome.position,
    toPageId: outcome.toPageId
  };
}

export async function updateExplorationQuizOutcomeAction(
  outcomeId: number,
  rawLabel: string,
  targetPageId: number | null
) {
  const { user, outcome, page, exploration } = await requireOutcomeEditor(outcomeId);
  const label = requiredBoundedText(rawLabel, CONTENT_LIMITS.shortText, "Route label");
  const normalizedTarget = targetPageId === null ? null : Number(targetPageId);
  if (normalizedTarget !== null) {
    if (!Number.isInteger(normalizedTarget)) throw new Error("Invalid target page.");
    const target = await prisma.explorationPage.findFirst({
      where: { id: normalizedTarget, playlistId: page.playlistId },
      select: { id: true }
    });
    if (!target) throw new Error("The target page does not belong to this exploration.");
  }
  await prisma.explorationBlockOutcome.update({
    where: { id: outcome.id },
    data: { label, toPageId: normalizedTarget }
  });
  await recordExplorationChange(page.playlistId, user.id, `Updated a quiz route from "${page.title}"`);
  revalidateExploration(exploration.slug, { editor: false });
  return { outcomeId: outcome.id, label, targetPageId: normalizedTarget };
}

export async function deleteExplorationQuizOutcomeAction(outcomeId: number) {
  const { user, outcome, page, exploration } = await requireOutcomeEditor(outcomeId);
  await prisma.explorationBlockOutcome.delete({ where: { id: outcome.id } });
  await recordExplorationChange(page.playlistId, user.id, `Deleted a quiz route from "${page.title}"`);
  revalidateExploration(exploration.slug, { editor: false });
  return { outcomeId: outcome.id };
}

async function deleteExplorationPageRecord(pageId: number) {
  const { user, page, exploration } = await requirePageEditor(pageId);
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
    await tx.explorationBlockOption.updateMany({
      where: { toPageId: page.id },
      data: { action: ExplorationOptionAction.STAY, toPageId: null }
    });
    await tx.explorationPage.delete({ where: { id: page.id } });
    if (page.isStart) await tx.explorationPage.update({ where: { id: replacement.id }, data: { isStart: true } });
    if (page.isEnd) await tx.explorationPage.update({ where: { id: endingReplacement.id }, data: { isEnd: true } });
  });
  await recordExplorationChange(page.playlistId, user.id, `Deleted page "${page.title}"`);
  return {
    deletedPageId: page.id,
    explorationSlug: exploration.slug,
    newStartPageId: page.isStart ? replacement.id : null,
    replacementPageId: replacement.id
  };
}

export async function deleteExplorationCanvasPageAction(pageId: number) {
  const result = await deleteExplorationPageRecord(pageId);
  revalidateExploration(result.explorationSlug, { editor: false });
  return result;
}

export async function deleteExplorationPageAction(pageId: number) {
  const result = await deleteExplorationPageRecord(pageId);
  revalidateExploration(result.explorationSlug);
  redirect(`/explorations/${result.explorationSlug}/edit?page=${result.replacementPageId}` as Route);
}

export async function createExplorationBlockAction(pageId: number, formData: FormData) {
  const { user, page, exploration } = await requirePageEditor(pageId);
  const kind = enumValue(Object.values(ExplorationBlockKind), formData.get("kind"), ExplorationBlockKind.MARKDOWN);
  const requestedBranchId = Number(formData.get("branchId")) || null;
  const branch = requestedBranchId
    ? await prisma.explorationBranch.findFirst({ where: { id: requestedBranchId, pageId } })
    : null;
  if (requestedBranchId && !branch) throw new Error("This branch does not belong to the page.");
  const referenceSlug = ensureSlug(String(formData.get("referenceSlug") ?? ""));
  const [problem, concept, last] = await Promise.all([
    kind === ExplorationBlockKind.PROBLEM && referenceSlug
      ? prisma.problem.findUnique({ where: { slug: referenceSlug }, select: { id: true } })
      : null,
    kind === ExplorationBlockKind.CONCEPT && referenceSlug
      ? prisma.concept.findUnique({ where: { slug: referenceSlug }, select: { id: true } })
      : null,
    prisma.explorationBlock.findFirst({
      where: { pageId, branchId: requestedBranchId },
      orderBy: { position: "desc" }
    })
  ]);
  if (kind === ExplorationBlockKind.PROBLEM && !problem) throw new Error("Problem not found.");
  if (kind === ExplorationBlockKind.CONCEPT && !concept) throw new Error("Concept not found.");
  const bodyMarkdown = boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Block content") || null;
  const name = boundedText(formData.get("name"), CONTENT_LIMITS.title, "Block name") || null;
  const quizType = kind === ExplorationBlockKind.QUIZ
    ? enumValue(Object.values(ExplorationQuizType), formData.get("quizType"), ExplorationQuizType.SINGLE_CHOICE)
    : null;

  const block = await prisma.explorationBlock.create({
    data: {
      pageId,
      branchId: requestedBranchId,
      kind,
      name,
      bodyMarkdown,
      bodyHtml: bodyMarkdown ? await renderMarkdownContent(bodyMarkdown) : null,
      position: (last?.position ?? 0) + 1,
      problemId: problem?.id ?? null,
      conceptId: concept?.id ?? null,
      quizType,
      settings: quizType ? jsonInput(blockSettings(formData)) : Prisma.JsonNull,
      required: kind === ExplorationBlockKind.CHOICE || formData.get("required") === "on",
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
  await recordExplorationChange(
    page.playlistId,
    user.id,
    `Added ${kind.toLocaleLowerCase().replaceAll("_", " ")} block to "${page.title}"`
  );
  // Keep the current studio mounted while its client form selects the new block.
  revalidateExploration(exploration.slug, { editor: false });
  return { blockId: block.id };
}

export async function updateExplorationBlockNameAction(blockId: number, formData: FormData) {
  const { user, block, page, exploration } = await requireBlockEditor(blockId);
  const name = boundedText(formData.get("name"), CONTENT_LIMITS.title, "Block name") || null;
  if (name === block.name) return;
  await prisma.explorationBlock.update({ where: { id: blockId }, data: { name } });
  await recordExplorationChange(
    page.playlistId,
    user.id,
    name ? `Named block ${block.position} "${name}"` : `Removed the name of block ${block.position}`
  );
  revalidateExploration(exploration.slug);
}

export async function updateExplorationBlockAction(blockId: number, formData: FormData) {
  const { user, block, page, exploration } = await requireBlockEditor(blockId);
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
  await prisma.explorationBlock.update({
    where: { id: blockId },
    data: {
      ...(formData.has("kind") ? { kind } : {}),
      bodyMarkdown,
      bodyHtml: bodyMarkdown ? await renderMarkdownContent(bodyMarkdown) : null,
      explanationMarkdown,
      explanationHtml: explanationMarkdown ? await renderMarkdownContent(explanationMarkdown) : null,
      problemId: problem?.id ?? null,
      conceptId: concept?.id ?? null,
      quizType,
      ...(kind === ExplorationBlockKind.CHOICE && block.kind !== ExplorationBlockKind.CHOICE ? { required: true } : {}),
      settings: quizType ? jsonInput(blockSettings(formData)) : Prisma.JsonNull
    }
  });
  if (kind === ExplorationBlockKind.QUIZ && block.kind !== ExplorationBlockKind.QUIZ) {
    const [routedOptions, answerOutcomes] = await Promise.all([
      prisma.explorationBlockOption.findMany({
        where: { blockId, toPageId: { not: null } },
        orderBy: { position: "asc" }
      }),
      prisma.explorationBlockOutcome.findMany({
        where: { blockId, kind: ExplorationOutcomeKind.ANSWER },
        include: { matches: true }
      })
    ]);
    const routedOptionIds = new Set(answerOutcomes.flatMap((outcome) => outcome.matches.map((match) => match.optionId)));
    for (const option of routedOptions) {
      if (routedOptionIds.has(option.id)) continue;
      await prisma.explorationBlockOutcome.create({
        data: {
          blockId,
          kind: ExplorationOutcomeKind.ANSWER,
          label: option.label,
          position: option.position,
          toPageId: option.toPageId,
          matches: { create: { optionId: option.id } }
        }
      });
    }
  }
  if (formData.get("skipHistory") !== "true") {
    await recordExplorationChange(
      page.playlistId,
      user.id,
      `Updated block ${block.position} on "${page.title}"`
    );
  }
  revalidateExploration(exploration.slug, { editor: block.kind !== kind });
}

export async function setExplorationBlockPositionAction(blockId: number, requestedPosition: number) {
  const { user, block, page, exploration } = await requireBlockEditor(blockId);
  const blocks = await prisma.explorationBlock.findMany({
    where: { page: { playlistId: page.playlistId } },
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
  await recordExplorationChange(page.playlistId, user.id, "Reordered exploration blocks");
  revalidateExploration(exploration.slug);
  return { position };
}

export async function deleteExplorationBlockAction(blockId: number) {
  const { user, block, page, exploration } = await requireBlockEditor(blockId);
  const fallback = block.continueToBlockId ?? (await prisma.explorationBlock.findFirst({
    where: { id: { not: blockId }, page: { playlistId: page.playlistId } },
    orderBy: [{ isStart: "desc" }, { id: "asc" }],
    select: { id: true }
  }))?.id ?? null;
  await prisma.$transaction(async (tx) => {
    const replacement = block.continueToBlockId;
    await tx.explorationBlock.updateMany({
      where: { continueToBlockId: blockId },
      data: replacement === null
        ? { continueToBlockId: null, autoContinue: false }
        : { continueToBlockId: replacement }
    });
    await tx.explorationBlockOption.updateMany({
      where: { toBlockId: blockId },
      data: { toBlockId: replacement, action: replacement ? ExplorationOptionAction.PAGE : ExplorationOptionAction.STAY }
    });
    await tx.explorationBlockOutcome.updateMany({
      where: { toBlockId: blockId },
      data: { toBlockId: replacement }
    });
    await tx.explorationBlock.delete({ where: { id: blockId } });
    if ((block.isStart || block.isEnd) && fallback) {
      await tx.explorationBlock.update({
        where: { id: fallback },
        data: {
          ...(block.isStart ? { isStart: true } : {}),
          ...(block.isEnd ? { isEnd: true } : {})
        }
      });
    }
  });
  await recordExplorationChange(page.playlistId, user.id, "Deleted an exploration block");
  revalidateExploration(exploration.slug, { editor: false });
}

export async function createExplorationOptionAction(blockId: number, formData: FormData) {
  const { user, block, page, exploration } = await requireBlockEditor(blockId);
  if (block.kind !== ExplorationBlockKind.QUIZ && block.kind !== ExplorationBlockKind.CHOICE) {
    throw new Error("Only quiz and choice blocks accept options.");
  }
  const label = requiredBoundedText(formData.get("label"), CONTENT_LIMITS.shortText, "Option label");
  const value = boundedText(formData.get("value"), CONTENT_LIMITS.shortText, "Option value") || null;
  const feedbackMarkdown = boundedText(formData.get("feedbackMarkdown"), CONTENT_LIMITS.longNote, "Feedback") || null;
  const toPageId = Number(formData.get("toPageId")) || null;
  const toBlockId = Number(formData.get("toBlockId")) || null;
  if (toPageId) {
    const target = await prisma.explorationPage.findFirst({ where: { id: toPageId, playlistId: exploration.id } });
    if (!target) throw new Error("Target page does not belong to this exploration.");
  }
  if (toBlockId) {
    const target = await prisma.explorationBlock.findFirst({
      where: { id: toBlockId, page: { playlistId: exploration.id } },
      select: { id: true }
    });
    if (!target) throw new Error("Target block does not belong to this exploration.");
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
      action: block.kind === ExplorationBlockKind.CHOICE && (toPageId || toBlockId)
        ? ExplorationOptionAction.PAGE
        : ExplorationOptionAction.STAY,
      label,
      value,
      feedbackMarkdown,
      feedbackHtml: feedbackMarkdown ? await renderMarkdownContent(feedbackMarkdown) : null,
      isCorrect: block.kind === ExplorationBlockKind.QUIZ ? formData.get("isCorrect") === "on" : null,
      toPageId,
      toBlockId,
      effects: effects ? jsonInput(effects) : Prisma.JsonNull,
      position: (last?.position ?? 0) + 1
    }
  });
  await recordExplorationChange(page.playlistId, user.id, `Added an option to block ${block.position} on "${page.title}"`);
  revalidateExploration(exploration.slug);
}

export async function updateExplorationOptionAction(optionId: number, formData: FormData) {
  const option = await prisma.explorationBlockOption.findUnique({
    where: { id: optionId },
    select: { action: true, blockId: true, revealBranchId: true, toBlockId: true, toPageId: true }
  });
  if (!option) throw new Error("Option not found.");
  const { user, block, page, exploration } = await requireBlockEditor(option.blockId);
  const label = requiredBoundedText(formData.get("label"), CONTENT_LIMITS.shortText, "Option label");
  const action = block.kind === ExplorationBlockKind.CHOICE
    ? enumValue(Object.values(ExplorationOptionAction), formData.get("action"), option.action)
    : option.action;
  const toPageId = formData.has("toPageId") ? Number(formData.get("toPageId")) || null : option.toPageId;
  const toBlockId = formData.has("toBlockId") ? Number(formData.get("toBlockId")) || null : option.toBlockId;
  if (toPageId) {
    const target = await prisma.explorationPage.findFirst({ where: { id: toPageId, playlistId: exploration.id } });
    if (!target) throw new Error("Target page does not belong to this exploration.");
  }
  if (toBlockId) {
    const target = await prisma.explorationBlock.findFirst({
      where: { id: toBlockId, page: { playlistId: exploration.id } },
      select: { id: true }
    });
    if (!target) throw new Error("Target block does not belong to this exploration.");
  }
  await prisma.$transaction(async (tx) => {
    let revealBranchId = option.revealBranchId;
    if (action === ExplorationOptionAction.REVEAL && revealBranchId === null) {
      const branch = await tx.explorationBranch.create({
        data: {
          pageId: page.id,
          parentBranchId: block.branchId,
          label: `After "${label}"`
        }
      });
      revealBranchId = branch.id;
      await tx.explorationBlock.create({
        data: {
          pageId: page.id,
          branchId: branch.id,
          kind: ExplorationBlockKind.MARKDOWN,
          position: 1
        }
      });
    } else if (revealBranchId !== null) {
      await tx.explorationBranch.update({
        where: { id: revealBranchId },
        data: { label: `After "${label}"` }
      });
    }
    await tx.explorationBlockOption.update({
      where: { id: optionId },
      data: {
        action,
        label,
        revealBranchId,
        ...(formData.get("isCorrectField") === "true"
          ? { isCorrect: formData.get("isCorrect") === "on" }
          : {}),
        toPageId,
        toBlockId
      }
    });
    await tx.explorationBlockOutcome.updateMany({
      where: {
        kind: ExplorationOutcomeKind.ANSWER,
        matches: { some: { optionId } }
      },
      data: { label, toPageId, toBlockId }
    });
  });
  await recordExplorationChange(page.playlistId, user.id, `Updated an option in block ${block.position} on "${page.title}"`);
  revalidateExploration(exploration.slug);
}

export async function deleteExplorationOptionAction(optionId: number) {
  const option = await prisma.explorationBlockOption.findUnique({ where: { id: optionId }, select: { blockId: true } });
  if (!option) return;
  const { user, block, page, exploration } = await requireBlockEditor(option.blockId);
  await prisma.$transaction(async (tx) => {
    const liveOption = await tx.explorationBlockOption.findUnique({
      where: { id: optionId },
      select: { revealBranchId: true }
    });
    await tx.explorationBlockOutcome.deleteMany({
      where: { matches: { some: { optionId } } }
    });
    if (liveOption?.revealBranchId) {
      await tx.explorationBranch.delete({ where: { id: liveOption.revealBranchId } });
    }
    await tx.explorationBlockOption.delete({ where: { id: optionId } });
  });
  await recordExplorationChange(page.playlistId, user.id, `Deleted an option from block ${block.position} on "${page.title}"`);
  revalidateExploration(exploration.slug);
}

export async function deleteExplorationBranchAction(branchId: number) {
  const { user, branch, page, exploration } = await requireBranchEditor(branchId);
  await prisma.$transaction(async (tx) => {
    if (branch.sourceOption) {
      await tx.explorationBlockOption.update({
        where: { id: branch.sourceOption.id },
        data: { action: ExplorationOptionAction.STAY, revealBranchId: null }
      });
    }
    await tx.explorationBranch.delete({ where: { id: branch.id } });
  });
  await recordExplorationChange(page.playlistId, user.id, `Deleted inline branch "${branch.label}" from "${page.title}"`);
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
          branches: { orderBy: { id: "asc" } },
          blocks: {
            orderBy: { position: "asc" },
            include: {
              problem: { select: { id: true, translationGroupId: true } },
              concept: { select: { id: true, translationGroupId: true } },
              options: { orderBy: { position: "asc" } },
              outcomes: { include: { matches: true }, orderBy: { position: "asc" } }
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
    const branchIds = new Map<number, number>();
    const blockIds = new Map<number, number>();
    const optionIds = new Map<number, number>();
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
          canvasX: page.canvasX,
          canvasY: page.canvasY,
          visibilityRule: page.visibilityRule ? jsonInput(page.visibilityRule) : Prisma.JsonNull
        }
      });
      pageIds.set(page.id, nextPage.id);
      const pendingBranches = [...page.branches];
      while (pendingBranches.length) {
        const nextIndex = pendingBranches.findIndex((branch) =>
          branch.parentBranchId === null || branchIds.has(branch.parentBranchId)
        );
        if (nextIndex < 0) throw new Error("Exploration branches contain an invalid cycle.");
        const [branch] = pendingBranches.splice(nextIndex, 1);
        const nextBranch = await tx.explorationBranch.create({
          data: {
            pageId: nextPage.id,
            key: branch.key,
            label: branch.label,
            parentBranchId: branch.parentBranchId ? branchIds.get(branch.parentBranchId) ?? null : null
          }
        });
        branchIds.set(branch.id, nextBranch.id);
      }
      for (const block of page.blocks) {
        const nextBlock = await tx.explorationBlock.create({
          data: {
            pageId: nextPage.id,
            branchId: block.branchId ? branchIds.get(block.branchId) ?? null : null,
            key: block.key,
            canvasX: block.canvasX,
            canvasY: block.canvasY,
            isStart: block.isStart,
            isEnd: block.isEnd,
            autoContinue: block.autoContinue,
            kind: block.kind,
            name: block.name,
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
      if (!page.continueToPageId) continue;
      await tx.explorationPage.update({
        where: { id: pageIds.get(page.id)! },
        data: { continueToPageId: pageIds.get(page.continueToPageId) ?? null }
      });
    }
    for (const page of source.pages) {
      for (const block of page.blocks) {
        if (!block.continueToBlockId) continue;
        await tx.explorationBlock.update({
          where: { id: blockIds.get(block.id)! },
          data: { continueToBlockId: blockIds.get(block.continueToBlockId) ?? null }
        });
      }
    }
    for (const page of source.pages) {
      for (const block of page.blocks) {
        const nextBlockId = blockIds.get(block.id)!;
        for (const option of block.options) {
          const nextOption = await tx.explorationBlockOption.create({
            data: {
              blockId: nextBlockId,
              label: option.label,
              value: option.value,
              feedbackMarkdown: option.feedbackMarkdown,
              feedbackHtml: option.feedbackHtml,
              isCorrect: option.isCorrect,
              action: option.action,
              toPageId: option.toPageId ? pageIds.get(option.toPageId) ?? null : null,
              toBlockId: option.toBlockId ? blockIds.get(option.toBlockId) ?? null : null,
              revealBranchId: option.revealBranchId ? branchIds.get(option.revealBranchId) ?? null : null,
              effects: option.effects ? jsonInput(option.effects) : Prisma.JsonNull,
              position: option.position
            }
          });
          optionIds.set(option.id, nextOption.id);
        }
        for (const outcome of block.outcomes) {
          await tx.explorationBlockOutcome.create({
            data: {
              blockId: nextBlockId,
              kind: outcome.kind,
              label: outcome.label,
              toPageId: outcome.toPageId ? pageIds.get(outcome.toPageId) ?? null : null,
              toBlockId: outcome.toBlockId ? blockIds.get(outcome.toBlockId) ?? null : null,
              position: outcome.position,
              matches: outcome.matches.length
                ? {
                    create: outcome.matches.flatMap((match) => {
                      const optionId = optionIds.get(match.optionId);
                      return optionId ? [{ optionId }] : [];
                    })
                  }
                : undefined
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
          branches: { orderBy: { id: "asc" } },
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
              options: { orderBy: { position: "asc" } },
              outcomes: { include: { matches: true }, orderBy: { position: "asc" } }
            }
          }
        }
      }
    }
  });
  if (!exploration) throw new Error("Exploration not found.");
  return exploration;
}

async function recordExplorationChange(playlistId: number, userId: number, summary: string) {
  const snapshot = await explorationSnapshot(playlistId);
  const latest = await prisma.explorationEdition.findFirst({
    where: { playlistId },
    orderBy: { version: "desc" },
    include: { _count: { select: { sessions: true } } }
  });

  if (latest && shouldCoalesceExplorationChange(
    { ...latest, sessionCount: latest._count.sessions },
    userId,
    summary
  )) {
    await prisma.explorationEdition.update({
      where: { id: latest.id },
      data: { snapshot: jsonInput(snapshot), publishedAt: new Date() }
    });
    return;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const newest = await prisma.explorationEdition.findFirst({
      where: { playlistId },
      orderBy: { version: "desc" },
      select: { version: true }
    });
    try {
      await prisma.explorationEdition.create({
        data: {
          playlistId,
          version: (newest?.version ?? 0) + 1,
          snapshot: jsonInput(snapshot),
          changeSummary: summary,
          publishedById: userId,
          publishedAt: new Date()
        }
      });
      return;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || attempt === 2) throw error;
    }
  }
}

export async function publishExplorationAction(playlistId: number, _formData: FormData) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
  const snapshot = await explorationSnapshot(playlistId);
  if (snapshot.pages.length === 0) throw new Error("Add at least one page before publishing.");
  if (exploration.status === ExplorationStatus.PUBLISHED) return;
  const publishedAt = new Date();

  await prisma.playlist.update({
    where: { id: playlistId },
    data: { status: ExplorationStatus.PUBLISHED, publishedAt }
  });
  await recordExplorationChange(playlistId, user.id, "Published exploration");

  const followers = await prisma.playlistFollow.findMany({ where: { playlistId }, select: { userId: true } });
  await Promise.all(
    followers.map(({ userId }) =>
      createNotification({
        userId,
        actorId: user.id,
        type: NotificationType.EXPLORATION_PUBLISHED,
        title: `${exploration.title} was published`,
        body: "The exploration is ready to read.",
        href: `/explorations/${exploration.slug}`
      })
    )
  );
  revalidateExploration(exploration.slug);
}

export async function changeExplorationStatusAction(playlistId: number, status: ExplorationStatus) {
  const { user, exploration } = await requireExplorationEditor(playlistId);
  if (status === ExplorationStatus.PUBLISHED) throw new Error("Use Publish to publish this exploration.");
  if (!Object.values(ExplorationStatus).includes(status)) throw new Error("Invalid exploration status.");
  await prisma.playlist.update({ where: { id: playlistId }, data: { status } });
  await recordExplorationChange(playlistId, user.id, `Changed status to ${status.toLocaleLowerCase().replaceAll("_", " ")}`);
  revalidateExploration(exploration.slug);
}

type QuizSettings = { expectedAnswer?: unknown; tolerance?: unknown; caseSensitive?: boolean };

export async function submitExplorationResponseAction(
  playlistId: number,
  pageKey: string,
  blockKey: string,
  response: unknown,
  persistResponse = true,
  rawState?: ExplorationState,
  rawPathBlockKeys: string[] = []
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
  const liveBlock = await prisma.explorationBlock.findFirst({
    where: { key: blockKey, page: { key: pageKey, playlistId } },
    include: {
      options: { orderBy: { position: "asc" } },
      outcomes: { include: { matches: true }, orderBy: { position: "asc" } },
      page: true
    }
  });
  const block = liveBlock;
  const sourcePage = liveBlock?.page;
  if (!block || !sourcePage) throw new Error("Exploration block not found.");
  if (block.kind !== ExplorationBlockKind.QUIZ && block.kind !== ExplorationBlockKind.CHOICE) {
    throw new Error("This block does not accept a response.");
  }

  const pageBlocks = block.kind === ExplorationBlockKind.CHOICE
    ? await prisma.explorationBlock.findMany({
        where: { pageId: block.pageId },
        select: {
          branchId: true,
          key: true,
          kind: true,
          position: true,
          visibilityRule: true,
          options: { select: { action: true, revealBranchId: true } }
        }
      })
    : [];

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
  if (block.kind === ExplorationBlockKind.CHOICE && !selected) throw new Error("Invalid choice.");
  const matchedOutcome = block.kind === ExplorationBlockKind.QUIZ
    ? resolveExplorationQuizOutcome(
        block.outcomes.map((outcome) => ({
          id: outcome.id,
          kind: outcome.kind,
          optionIds: outcome.matches.map((match) => match.optionId),
          position: outcome.position,
          toBlockId: outcome.toBlockId,
          toPageId: outcome.toPageId
        })),
        optionIds,
        isCorrect
      )
    : null;
  const selectedPageId = selected?.action === ExplorationOptionAction.PAGE ? selected.toPageId : null;
  const selectedBlockId = selected?.toBlockId ?? null;
  const nextPageId = matchedOutcome?.toPageId ?? selectedPageId ?? null;
  const nextBlockId = nextExplorationBlockId(matchedOutcome?.toBlockId, selectedBlockId, block.continueToBlockId);
  let state = asExplorationState(rawState ?? previousSession?.state);
  let clearedBlockKeys: string[] = [];
  let revealedBranchId: number | null = null;
  if (block.kind === ExplorationBlockKind.CHOICE) {
    const rootBranchIds = block.options.flatMap((option) =>
      option.revealBranchId === null ? [] : [option.revealBranchId]
    );
    const cleared = clearExplorationBranches(state, pageBlocks, rootBranchIds, pageKey);
    state = cleared.state;
    clearedBlockKeys = cleared.clearedBlockKeys;
    if (selected?.action === ExplorationOptionAction.REVEAL && selected.revealBranchId !== null) {
      revealedBranchId = selected.revealBranchId;
      state[explorationBranchStateKey(selected.revealBranchId)] = true;
    }
  }
  state = applyEffects(state, selectedOptions.flatMap((option) => Array.isArray(option.effects) ? option.effects : []));
  state.explorationCompleted = false;
  const stableBlockKey = `${pageKey}:${blockKey}`;
  state[`block.${stableBlockKey}.answered`] = true;
  if (isCorrect !== null) state[`block.${stableBlockKey}.correct`] = isCorrect;

  let score = isCorrect ? block.points : 0;
  if (user && persistResponse) {
    const maxScore = (await prisma.explorationBlock.aggregate({
      where: { page: { playlistId } },
      _sum: { points: true }
    }))._sum.points ?? 0;
    const selectedLivePage = nextPageId
      ? await prisma.explorationPage.findFirst({
          where: { id: nextPageId, playlistId },
          select: { id: true, key: true }
        })
      : null;
    const targetLiveBlock = nextBlockId
      ? await prisma.explorationBlock.findFirst({
          where: { id: nextBlockId, page: { playlistId } },
          include: { page: { select: { id: true, key: true } } }
        })
      : null;
    const responseAdvances = block.kind === ExplorationBlockKind.CHOICE || block.autoContinue;
    const sessionTargetBlock = responseAdvances ? targetLiveBlock : null;
    const targetPageKey = sessionTargetBlock?.page.key ?? (responseAdvances ? selectedLivePage?.key : null) ?? pageKey;
    const targetLivePage = (responseAdvances ? selectedLivePage : null) ?? await prisma.explorationPage.findFirst({
      where: { playlistId, key: targetPageKey }, select: { id: true, key: true }
    });
    const requestedPathBlockKeys = Array.isArray(rawPathBlockKeys) && rawPathBlockKeys.length
      ? rawPathBlockKeys.map(String).slice(-2000)
      : Array.isArray(previousSession?.pathBlockKeys)
        ? previousSession.pathBlockKeys.map(String).slice(-2000)
        : [];
    const validPathBlocks = requestedPathBlockKeys.length
      ? await prisma.explorationBlock.findMany({
          where: { key: { in: requestedPathBlockKeys }, page: { playlistId } },
          select: { key: true }
        })
      : [];
    const validPathKeys = new Set(validPathBlocks.map((candidate) => candidate.key));
    const previousPathBlockKeys = requestedPathBlockKeys.filter((key) => validPathKeys.has(key));
    const sourcePathIndex = previousPathBlockKeys.lastIndexOf(block.key);
    const pathBlockKeys = sourcePathIndex >= 0
      ? previousPathBlockKeys.slice(0, sourcePathIndex + 1)
      : [...previousPathBlockKeys, block.key];
    if (sessionTargetBlock && pathBlockKeys.at(-1) !== sessionTargetBlock.key) {
      pathBlockKeys.push(sessionTargetBlock.key);
    }
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
    const visitedBlockKeys = new Set<string>(
      Array.isArray(previousSession?.visitedBlockKeys)
        ? previousSession.visitedBlockKeys.map(String)
        : []
    );
    visitedBlockKeys.add(block.key);
    const session = await prisma.explorationSession.upsert({
      where: { playlistId_userId: { playlistId, userId: user.id } },
      update: {
        editionId: null,
        currentPageId: sessionTargetBlock?.page.id ?? targetLivePage?.id ?? liveBlock?.pageId ?? null,
        currentPageKey: targetPageKey,
        currentBlockKey: sessionTargetBlock?.key ?? block.key,
        state: jsonInput(state),
        visitedPageIds: jsonInput([...visited]),
        visitedPageKeys: jsonInput([...visitedKeys]),
        visitedBlockKeys: jsonInput([...visitedBlockKeys]),
        pathBlockKeys: jsonInput(pathBlockKeys),
        maxScore,
        status: ExplorationSessionStatus.IN_PROGRESS,
        completedAt: null
      },
      create: {
        playlistId,
        userId: user.id,
        editionId: null,
        currentPageId: sessionTargetBlock?.page.id ?? targetLivePage?.id ?? liveBlock?.pageId ?? null,
        currentPageKey: targetPageKey,
        currentBlockKey: sessionTargetBlock?.key ?? block.key,
        state: jsonInput(state),
        visitedPageIds: jsonInput([...visited]),
        visitedPageKeys: jsonInput([...visitedKeys]),
        visitedBlockKeys: jsonInput([...visitedBlockKeys]),
        pathBlockKeys: jsonInput(pathBlockKeys),
        maxScore
      }
    });
    if (clearedBlockKeys.length) {
      await prisma.explorationAnswer.deleteMany({
        where: { sessionId: session.id, blockKey: { in: clearedBlockKeys } }
      });
    }
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
    clearedBlockKeys,
    nextPageId,
    nextBlockId,
    revealedBranchId,
    state,
    score
  };
}

export async function saveExplorationBlockProgressAction(
  playlistId: number,
  blockKey: string,
  rawState: ExplorationState,
  completed = false,
  rawPathBlockKeys: string[] = []
) {
  const user = await getCurrentUser();
  if (!user) return { saved: false };
  const exploration = await prisma.playlist.findUnique({
    where: { id: playlistId },
    include: { collaborators: true }
  });
  if (!exploration || !canViewExploration(user, exploration)) throw new Error("Exploration not found.");
  const block = await prisma.explorationBlock.findFirst({
    where: { key: blockKey, page: { playlistId } },
    include: { page: { select: { id: true, key: true } } }
  });
  if (!block) throw new Error("Invalid exploration block.");
  const requestedPathBlockKeys = Array.isArray(rawPathBlockKeys)
    ? rawPathBlockKeys.map(String).slice(-2000)
    : [];
  const validPathBlocks = requestedPathBlockKeys.length
    ? await prisma.explorationBlock.findMany({
        where: { key: { in: requestedPathBlockKeys }, page: { playlistId } },
        select: { key: true }
      })
    : [];
  const validPathKeys = new Set(validPathBlocks.map((candidate) => candidate.key));
  const pathBlockKeys = requestedPathBlockKeys.filter((key) => validPathKeys.has(key));
  if (pathBlockKeys.at(-1) !== block.key) pathBlockKeys.push(block.key);
  const existing = await prisma.explorationSession.findUnique({
    where: { playlistId_userId: { playlistId, userId: user.id } }
  });
  const visitedBlockKeys = new Set<string>(
    Array.isArray(existing?.visitedBlockKeys) ? existing.visitedBlockKeys.map(String) : []
  );
  visitedBlockKeys.add(block.key);
  await prisma.explorationSession.upsert({
    where: { playlistId_userId: { playlistId, userId: user.id } },
    update: {
      editionId: null,
      currentPageId: block.page.id,
      currentPageKey: block.page.key,
      currentBlockKey: block.key,
      state: jsonInput(asExplorationState(rawState)),
      visitedBlockKeys: jsonInput([...visitedBlockKeys]),
      pathBlockKeys: jsonInput(pathBlockKeys),
      status: completed ? ExplorationSessionStatus.COMPLETED : ExplorationSessionStatus.IN_PROGRESS,
      completedAt: completed ? new Date() : null
    },
    create: {
      playlistId,
      userId: user.id,
      editionId: null,
      currentPageId: block.page.id,
      currentPageKey: block.page.key,
      currentBlockKey: block.key,
      state: jsonInput(asExplorationState(rawState)),
      visitedBlockKeys: jsonInput([...visitedBlockKeys]),
      pathBlockKeys: jsonInput(pathBlockKeys),
      status: completed ? ExplorationSessionStatus.COMPLETED : ExplorationSessionStatus.IN_PROGRESS,
      completedAt: completed ? new Date() : null
    }
  });
  revalidatePath(`/explorations/${exploration.slug}`);
  return { saved: true };
}

export async function saveExplorationProgressAction(
  playlistId: number,
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
  const livePage = exploration.pages.find((page) => page.key === pageKey);
  if (!livePage) throw new Error("Invalid exploration page.");
  const visited = new Set<number>(
    Array.isArray(existing?.visitedPageIds) ? existing.visitedPageIds.map(Number).filter(Number.isInteger) : []
  );
  visited.add(pageId);
  const visitedKeys = new Set<string>(
    Array.isArray(existing?.visitedPageKeys) ? existing.visitedPageKeys.map(String) : []
  );
  visitedKeys.add(pageKey);
  await prisma.explorationSession.upsert({
    where: { playlistId_userId: { playlistId, userId: user.id } },
    update: {
      editionId: null,
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
      editionId: null,
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
