"use server";

import type { Route } from "next";
import {
  AttemptStatus,
  NotificationType,
  PostType,
  ProblemStatus,
  ProblemVerificationMode,
  QualityStatus,
  MathDomain,
  SourceType,
  TargetType,
  VoteType
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  checkHintAchievements,
  checkProblemSolvedByOthersAchievements,
  checkSolveAchievements,
  checkUsefulPostAchievements
} from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { unlockDate } from "@/lib/attempts";
import { prisma } from "@/lib/db";
import { boundedText, CONTENT_LIMITS, optionalBoundedText, requiredBoundedText } from "@/lib/content-limits";
import { syncInternalLinks } from "@/lib/internal-links";
import { canEditExploration } from "@/lib/explorations";
import {
  createNotification,
  notifyOwnerOfSiteActivity,
  notifyProblemAuthor,
  notifyProblemEditSubscribers
} from "@/lib/notifications";
import { parseContentLanguage, parseTranslationGroupId } from "@/lib/languages";
import { parseProblemDomains, syncProblemDomains } from "@/lib/problem-domains";
import { linkSpecificProblem, syncProblemRelationGroups } from "@/lib/problem-relations";
import {
  parseProblemVerificationMode,
  verificationMatches
} from "@/lib/problem-verification";
import { parseProblemDifficulty, tagsWithConjecture } from "@/lib/problems";
import { parseContributorQualityStatus } from "@/lib/quality";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  canArchiveProblem,
  canEditDiscussionHint,
  canEditVerificationMessage,
  canEditProblem,
  canJoinProblemDiscussion,
  canJoinVerificationDiscussion,
  canReviewProblemVerification,
  canRollbackProblem,
  canSetProblemQualityStatus,
  canUseAdminTools
} from "@/lib/permissions";
import { ensureSlug } from "@/lib/slug";
import { parseTagInput, syncProblemSpoilerTags, syncProblemTags } from "@/lib/tags";
import { contentLanguageViewHref } from "@/lib/translation-routing";
import { uniqueSlug } from "@/lib/unique-slug";
import { displayNameForUser } from "@/lib/user-display";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

function intField(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function listFingerprint(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort().join("|");
}

function parsedTagFingerprint(input: string) {
  return listFingerprint(parseTagInput(input).map((tag) => tag.slug));
}

function mergedAttemptStatus(left: AttemptStatus, right: AttemptStatus) {
  const rank: Record<AttemptStatus, number> = {
    STARTED: 0,
    BLOCKED: 1,
    REVIEW_LATER: 2,
    SOLVED: 3
  };
  return rank[right] > rank[left] ? right : left;
}

function storedTagFingerprint(items: Array<{ tag: { slug: string } }>) {
  return listFingerprint(items.map((item) => item.tag.slug));
}

function domainFingerprint(items: Array<{ mscCode: string; spoiler: boolean }>) {
  return listFingerprint(items.map((item) => `${item.mscCode}${item.spoiler ? ":spoiler" : ""}`));
}

function pushChange(changes: string[], changed: boolean, label: string) {
  if (changed) changes.push(label);
}

function problemEditNotificationBody({
  actorName,
  title,
  changedFields,
  editSummary
}: {
  actorName: string;
  title: string;
  changedFields: string[];
  editSummary: string;
}) {
  const changed = changedFields.length ? ` Changed: ${changedFields.join(", ")}.` : "";
  const summary = editSummary && editSummary !== "Problem edited" ? ` Summary: ${editSummary}.` : "";
  return `${actorName} edited "${title}".${changed}${summary}`;
}

async function requireProblemHintAdmin() {
  const user = await requireVerifiedUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit problem hints.");
  await assertRateLimit(`problem-hint:${user.id}`, 60, 60_000);
  return user;
}

export async function createProblemHintAction(problemId: number, problemSlug: string, formData: FormData) {
  const user = await requireProblemHintAdmin();
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Hint");
  const lastHint = await prisma.problemHint.findFirst({
    where: { problemId },
    orderBy: { position: "desc" },
    select: { position: true }
  });

  await prisma.problemHint.create({
    data: {
      problemId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      position: intField(formData.get("position"), (lastHint?.position ?? -1) + 1)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/edit`);
  redirect(`/problems/${problemSlug}/edit?hints=created` as Route);
}

export async function updateProblemHintAction(hintId: number, problemSlug: string, formData: FormData) {
  await requireProblemHintAdmin();
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Hint");

  await prisma.problemHint.update({
    where: { id: hintId },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      position: intField(formData.get("position"), 0)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/edit`);
  redirect(`/problems/${problemSlug}/edit?hints=updated` as Route);
}

export async function deleteProblemHintAction(hintId: number, problemSlug: string) {
  await requireProblemHintAdmin();
  await prisma.problemHint.delete({ where: { id: hintId } });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/edit`);
  redirect(`/problems/${problemSlug}/edit?hints=deleted` as Route);
}

export async function createProblemAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:create:${user.id}`, 5, 60_000);
  const title = boundedText(formData.get("title"), CONTENT_LIMITS.title, "Title") || "Untitled problem";
  const language = parseContentLanguage(formData.get("language"));
  const translationGroupId = parseTranslationGroupId(formData.get("translationGroupId"));
  const translationSourceSlug = ensureSlug(String(formData.get("translationSourceSlug") ?? ""), "");
  const bodyMarkdown =
    boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement") || "Statement to be written.";
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domains = parseProblemDomains(formData.getAll("domains"), formData.get("domain"), formData.getAll("domainSpoilers"));
  const domain = domains.find((item) => !item.spoiler)?.domain ?? MathDomain.OTHER;
  const origin = boundedText(formData.get("origin"), CONTENT_LIMITS.shortText, "Origin") || "Unknown";
  const originChapter = optionalBoundedText(formData.get("originChapter"), CONTENT_LIMITS.shortText, "Origin chapter");
  const originPage = optionalBoundedText(formData.get("originPage"), CONTENT_LIMITS.shortText, "Origin page");
  const originNote = optionalBoundedText(formData.get("originNote"), CONTENT_LIMITS.longNote, "Origin note");
  const listed = formData.get("listed") === "on";
  const verificationMode = parseProblemVerificationMode(formData.get("verificationMode"));
  const verificationPrompt = optionalBoundedText(
    formData.get("verificationPrompt"),
    CONTENT_LIMITS.mediumText,
    "Verification prompt"
  );
  const verificationAnswer = optionalBoundedText(
    formData.get("verificationAnswer"),
    CONTENT_LIMITS.mediumText,
    "Verification answer"
  );
  const addToExplorationSlug = ensureSlug(
    String(formData.get("addToExplorationSlug") ?? formData.get("addToPlaylistSlug") ?? ""),
    ""
  );
  const parentProblemSlug = ensureSlug(String(formData.get("parentProblemSlug") ?? ""), "");
  const qualityStatus = QualityStatus.UNREVIEWED;
  const tags = tagsWithConjecture(boundedText(formData.get("tags"), CONTENT_LIMITS.tagList, "Tags"), formData.get("conjecture"));
  const spoilerTags = boundedText(formData.get("spoilerTags"), CONTENT_LIMITS.tagList, "Spoiler tags");
  const relatedProblemGroups = boundedText(
    formData.get("relatedProblemGroups"),
    CONTENT_LIMITS.relationGroups,
    "Related problem groups"
  );

  if (verificationMode === ProblemVerificationMode.SELF_CHECK && !verificationAnswer) {
    throw new Error("Short answer verification requires an expected answer.");
  }

  const slug = await uniqueSlug("problem", title);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const problem = await prisma.$transaction(async (tx) => {
    if (translationGroupId) {
      const existingTranslation = await tx.problem.findFirst({
        where: { translationGroupId, language },
        select: { slug: true }
      });
      if (existingTranslation) {
        throw new Error("A problem translation already exists in this language.");
      }
    }
    const translationSource =
      translationGroupId && translationSourceSlug
        ? await tx.problem.findFirst({
            where: { slug: translationSourceSlug, translationGroupId },
            select: { id: true, authorId: true, difficulty: true, canAppearOnFrontPage: true, createdAt: true }
          })
        : null;
    const originalProblem = translationGroupId
      ? await tx.problem.findFirst({
          where: { translationGroupId, translatedFromProblemId: null },
          orderBy: { createdAt: "asc" },
          select: { authorId: true, difficulty: true, canAppearOnFrontPage: true, createdAt: true }
        })
      : null;
    const sourceRevision = translationSource
      ? await tx.pageRevision.findFirst({
          where: { pageType: SourceType.PROBLEM, pageId: translationSource.id },
          orderBy: { id: "desc" },
          select: { id: true }
        })
      : null;
    const sharedDifficulty = translationSource
      ? (originalProblem?.difficulty ?? translationSource.difficulty ?? difficulty)
      : difficulty;

    const created = await tx.problem.create({
      data: {
        slug,
        language,
        ...(translationGroupId ? { translationGroupId } : {}),
        ...(translationSource
          ? {
              translatedFromProblemId: translationSource.id,
              translatedFromRevisionId: sourceRevision?.id ?? null
            }
          : {}),
        title,
        bodyMarkdown,
        bodyHtml,
        difficulty: sharedDifficulty,
        domain,
        origin,
        originChapter,
        originPage,
        originNote,
        listed,
        ...(translationGroupId ? { createdAt: originalProblem?.createdAt ?? translationSource?.createdAt } : {}),
        canAppearOnFrontPage:
          originalProblem?.canAppearOnFrontPage ?? translationSource?.canAppearOnFrontPage ?? false,
        qualityStatus,
        verificationMode,
        verificationPrompt: verificationMode === ProblemVerificationMode.NONE ? null : verificationPrompt,
        verificationAnswer: verificationMode === ProblemVerificationMode.SELF_CHECK ? verificationAnswer : null,
        authorId: translationSource ? (originalProblem?.authorId ?? translationSource.authorId) : user.id,
        thread: { create: {} }
      }
    });
    await tx.problemFavorite.create({
      data: {
        userId: user.id,
        problemId: created.id
      }
    });
    if (translationGroupId) {
      const [groupAttempts, groupFavoriteUsers, groupProblems] = await Promise.all([
        tx.problemAttempt.findMany({
          where: { problem: { translationGroupId }, problemId: { not: created.id } },
          select: { userId: true, status: true, startedAt: true, discussionUnlockAt: true }
        }),
        tx.problemFavorite.findMany({
          where: { problem: { translationGroupId } },
          distinct: ["userId"],
          select: { userId: true }
        }),
        tx.problem.findMany({ where: { translationGroupId }, select: { id: true } })
      ]);
      const attemptsByUser = new Map<number, (typeof groupAttempts)[number]>();
      for (const attempt of groupAttempts) {
        const existing = attemptsByUser.get(attempt.userId);
        if (!existing) {
          attemptsByUser.set(attempt.userId, attempt);
          continue;
        }
        attemptsByUser.set(attempt.userId, {
          ...existing,
          status: mergedAttemptStatus(existing.status, attempt.status),
          startedAt: existing.startedAt < attempt.startedAt ? existing.startedAt : attempt.startedAt,
          discussionUnlockAt:
            existing.discussionUnlockAt < attempt.discussionUnlockAt
              ? existing.discussionUnlockAt
              : attempt.discussionUnlockAt
        });
      }
      if (attemptsByUser.size > 0) {
        await tx.problemAttempt.createMany({
          data: [...attemptsByUser.values()].map((attempt) => ({
            userId: attempt.userId,
            problemId: created.id,
            status: attempt.status,
            startedAt: attempt.startedAt,
            discussionUnlockAt: attempt.discussionUnlockAt
          })),
          skipDuplicates: true
        });
      }
      if (groupFavoriteUsers.length > 0) {
        await tx.problemFavorite.createMany({
          data: groupFavoriteUsers.flatMap(({ userId }) =>
            groupProblems.map(({ id: problemId }) => ({ userId, problemId }))
          ),
          skipDuplicates: true
        });
      }
    }
    if (addToExplorationSlug) {
      const playlist = await tx.playlist.findUnique({
        where: { slug: addToExplorationSlug },
        include: { collaborators: true }
      });
      if (playlist && canEditExploration(user, playlist)) {
        const last = await tx.playlistItem.findFirst({
          where: { playlistId: playlist.id },
          orderBy: { position: "desc" }
        });
        await tx.playlistItem.create({
          data: {
            playlistId: playlist.id,
            problemId: created.id,
            position: (last?.position ?? 0) + 1
          }
        });
        const targetPage = await tx.explorationPage.findFirst({
          where: { playlistId: playlist.id },
          orderBy: [{ isStart: "desc" }, { position: "asc" }]
        });
        if (targetPage) {
          const lastBlock = await tx.explorationBlock.findFirst({
            where: { pageId: targetPage.id },
            orderBy: { position: "desc" }
          });
          await tx.explorationBlock.create({
            data: {
              pageId: targetPage.id,
              kind: "PROBLEM",
              problemId: created.id,
              position: (lastBlock?.position ?? 0) + 1
            }
          });
        }
      }
    }
    if (parentProblemSlug) {
      const parentProblem = await tx.problem.findUnique({
        where: { slug: parentProblemSlug },
        select: { id: true, authorId: true }
      });
      if (parentProblem && canEditProblem(user, parentProblem)) {
        await linkSpecificProblem(tx, parentProblem.id, created.id);
      }
    }
    await syncInternalLinks(SourceType.PROBLEM, created.id, bodyMarkdown, tx, language);
    await syncProblemDomains(tx, created.id, domains);
    await syncProblemRelationGroups(tx, created.id, relatedProblemGroups);
    await syncProblemTags(created.id, tags, tx);
    await syncProblemSpoilerTags(created.id, spoilerTags, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: created.id,
        markdown: bodyMarkdown,
        editedById: user.id,
        editSummary: "Problem created"
      }
    });
    return created;
  });

  revalidatePath("/");
  await notifyOwnerOfSiteActivity({
    actor: user,
    type: NotificationType.PROBLEM_CREATED,
    title: "New problem created",
    body: `${displayNameForUser(user)} created "${problem.title}".`,
    href: `/problems/${problem.slug}`
  });
  redirect(contentLanguageViewHref("/problems", problem.slug, problem.language) as Route);
}

export async function updateProblemAction(problemId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:update:${user.id}`, 20, 60_000);
  const previous = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      authorId: true,
      slug: true,
      title: true,
      bodyMarkdown: true,
      difficulty: true,
      domain: true,
      origin: true,
      originChapter: true,
      originPage: true,
      originNote: true,
      listed: true,
      canAppearOnFrontPage: true,
      qualityStatus: true,
      verificationMode: true,
      verificationPrompt: true,
      verificationAnswer: true,
      language: true,
      translationGroupId: true,
      translatedFromProblemId: true,
      translatedFromRevisionId: true,
      domains: { select: { mscCode: true, spoiler: true } },
      tags: { include: { tag: { select: { slug: true } } } },
      spoilerTags: { include: { tag: { select: { slug: true } } } }
    }
  });
  if (!previous) throw new Error("Problem not found.");
  if (!canEditProblem(user, previous)) {
    throw new Error("You cannot edit this problem.");
  }

  const title = boundedText(formData.get("title"), CONTENT_LIMITS.title, "Title") || previous.title;
  const language = parseContentLanguage(formData.get("language"));
  const bodyMarkdown =
    boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement") || previous.bodyMarkdown;
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domains = parseProblemDomains(formData.getAll("domains"), formData.get("domain"), formData.getAll("domainSpoilers"));
  const domain = domains.find((item) => !item.spoiler)?.domain ?? MathDomain.OTHER;
  const origin = boundedText(formData.get("origin"), CONTENT_LIMITS.shortText, "Origin") || "Unknown";
  const originChapter = optionalBoundedText(formData.get("originChapter"), CONTENT_LIMITS.shortText, "Origin chapter");
  const originPage = optionalBoundedText(formData.get("originPage"), CONTENT_LIMITS.shortText, "Origin page");
  const originNote = optionalBoundedText(formData.get("originNote"), CONTENT_LIMITS.longNote, "Origin note");
  const listed = formData.get("listed") === "on";
  const canAppearOnFrontPage = canUseAdminTools(user)
    ? formData.get("canAppearOnFrontPage") === "on"
    : previous.canAppearOnFrontPage;
  const verificationMode = parseProblemVerificationMode(formData.get("verificationMode"));
  const verificationPrompt = optionalBoundedText(
    formData.get("verificationPrompt"),
    CONTENT_LIMITS.mediumText,
    "Verification prompt"
  );
  const verificationAnswer = optionalBoundedText(
    formData.get("verificationAnswer"),
    CONTENT_LIMITS.mediumText,
    "Verification answer"
  );
  const qualityStatusInput = formData.get("qualityStatus");
  const qualityStatus = qualityStatusInput
    ? parseContributorQualityStatus(qualityStatusInput, user.role)
    : previous.qualityStatus;
  const tags = tagsWithConjecture(boundedText(formData.get("tags"), CONTENT_LIMITS.tagList, "Tags"), formData.get("conjecture"));
  const spoilerTags = boundedText(formData.get("spoilerTags"), CONTENT_LIMITS.tagList, "Spoiler tags");
  const editSummary = boundedText(formData.get("editSummary"), CONTENT_LIMITS.shortText, "Edit summary") || "Problem edited";
  const markTranslationFresh = formData.get("markTranslationFresh") === "on";
  const relatedProblemGroups = boundedText(
    formData.get("relatedProblemGroups"),
    CONTENT_LIMITS.relationGroups,
    "Related problem groups"
  );

  if (verificationMode === ProblemVerificationMode.SELF_CHECK && !verificationAnswer) {
    throw new Error("Short answer verification requires an expected answer.");
  }

  const changedFields: string[] = [];
  pushChange(changedFields, previous.title !== title, "title");
  pushChange(changedFields, previous.bodyMarkdown !== bodyMarkdown, "statement");
  pushChange(changedFields, previous.language !== language, "language");
  pushChange(changedFields, previous.difficulty !== difficulty, "difficulty");
  pushChange(changedFields, domainFingerprint(previous.domains) !== domainFingerprint(domains), "domains");
  pushChange(
    changedFields,
    previous.origin !== origin ||
      previous.originChapter !== originChapter ||
      previous.originPage !== originPage ||
      previous.originNote !== originNote,
    "source"
  );
  pushChange(changedFields, previous.listed !== listed, "visibility");
  pushChange(changedFields, previous.canAppearOnFrontPage !== canAppearOnFrontPage, "front page eligibility");
  pushChange(changedFields, previous.qualityStatus !== qualityStatus, "quality");
  pushChange(
    changedFields,
    previous.verificationMode !== verificationMode ||
      previous.verificationPrompt !== (verificationMode === ProblemVerificationMode.NONE ? null : verificationPrompt) ||
      previous.verificationAnswer !== (verificationMode === ProblemVerificationMode.SELF_CHECK ? verificationAnswer : null),
    "verification"
  );
  pushChange(changedFields, storedTagFingerprint(previous.tags) !== parsedTagFingerprint(tags), "tags");
  pushChange(changedFields, storedTagFingerprint(previous.spoilerTags) !== parsedTagFingerprint(spoilerTags), "spoiler tags");

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  const problem = await prisma.$transaction(async (tx) => {
    if (language !== previous.language) {
      const existingTranslation = await tx.problem.findFirst({
        where: {
          id: { not: problemId },
          translationGroupId: previous.translationGroupId,
          language
        },
        select: { slug: true }
      });
      if (existingTranslation) {
        throw new Error("A problem translation already exists in this language.");
      }
    }

    const refreshedSourceRevision =
      markTranslationFresh && previous.translatedFromProblemId
        ? await tx.pageRevision.findFirst({
            where: { pageType: SourceType.PROBLEM, pageId: previous.translatedFromProblemId },
            orderBy: { id: "desc" },
            select: { id: true }
          })
        : null;

    const updated = await tx.problem.update({
      where: { id: problemId },
      data: {
        title,
        language,
        bodyMarkdown,
        bodyHtml,
        difficulty,
        domain,
        origin,
        originChapter,
        originPage,
        originNote,
        listed,
        canAppearOnFrontPage,
        qualityStatus,
        verificationMode,
        verificationPrompt: verificationMode === ProblemVerificationMode.NONE ? null : verificationPrompt,
        verificationAnswer: verificationMode === ProblemVerificationMode.SELF_CHECK ? verificationAnswer : null,
        ...(refreshedSourceRevision ? { translatedFromRevisionId: refreshedSourceRevision.id } : {})
      }
    });
    const siblingDifficultyWhere =
      difficulty === null
        ? { difficulty: { not: null } }
        : { OR: [{ difficulty: null }, { difficulty: { not: difficulty } }] };
    await tx.problem.updateMany({
      where: {
        translationGroupId: previous.translationGroupId,
        id: { not: problemId },
        ...siblingDifficultyWhere
      },
      data: { difficulty }
    });
    if (canAppearOnFrontPage !== previous.canAppearOnFrontPage) {
      await tx.problem.updateMany({
        where: {
          translationGroupId: previous.translationGroupId,
          id: { not: problemId },
          canAppearOnFrontPage: { not: canAppearOnFrontPage }
        },
        data: { canAppearOnFrontPage }
      });
    }

    await syncInternalLinks(SourceType.PROBLEM, updated.id, bodyMarkdown, tx, language);
    await syncProblemDomains(tx, updated.id, domains);
    await syncProblemRelationGroups(tx, updated.id, relatedProblemGroups);
    await syncProblemTags(updated.id, tags, tx);
    await syncProblemSpoilerTags(updated.id, spoilerTags, tx);
    const revision = await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: updated.id,
        markdown: bodyMarkdown,
        editedById: user.id,
        editSummary
      }
    });

    return { updated, revisionId: revision.id };
  });

  revalidatePath("/");
  revalidatePath(`/problems/${problem.updated.slug}`);
  revalidatePath(`/problems/${problem.updated.slug}/history`);
  await notifyProblemEditSubscribers({
    problemId,
    actorId: user.id,
    title: "Problem edited",
    body: problemEditNotificationBody({
      actorName: displayNameForUser(user),
      title: previous.title,
      changedFields,
      editSummary
    }),
    href: `/problems/${problem.updated.slug}/history#revision-${problem.revisionId}`
  });
  redirect(contentLanguageViewHref("/problems", problem.updated.slug, problem.updated.language) as Route);
}

export async function dismissProblemTranslationStaleNoticeAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:translation-dismiss:${user.id}`, 30, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      slug: true,
      language: true,
      translatedFromProblem: { select: { id: true, authorId: true } }
    }
  });

  if (!problem?.translatedFromProblem) {
    throw new Error("Translation source not found.");
  }
  if (problem.translatedFromProblem.authorId !== user.id && !canUseAdminTools(user)) {
    throw new Error("You cannot dismiss this translation notice.");
  }

  const latestSourceRevision = await prisma.pageRevision.findFirst({
    where: { pageType: SourceType.PROBLEM, pageId: problem.translatedFromProblem.id },
    orderBy: { id: "desc" },
    select: { id: true }
  });
  if (!latestSourceRevision) {
    throw new Error("Source revision not found.");
  }

  await prisma.problem.update({
    where: { id: problemId },
    data: { translatedFromRevisionId: latestSourceRevision.id }
  });

  revalidatePath(`/problems/${problem.slug}`);
  redirect(contentLanguageViewHref("/problems", problem.slug, problem.language) as Route);
}

export async function deleteProblemAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:delete:${user.id}`, 10, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, slug: true, authorId: true, bodyMarkdown: true, status: true }
  });

  if (!problem) throw new Error("Problem not found.");
  if (!canArchiveProblem(user, problem)) {
    throw new Error("You cannot delete this problem.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.problem.update({
      where: { id: problem.id },
      data: {
        status: ProblemStatus.ARCHIVED,
        listed: false
      }
    });
    await tx.internalLink.deleteMany({
      where: {
        sourceType: SourceType.PROBLEM,
        sourceId: problem.id
      }
    });
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: problem.id,
        markdown: problem.bodyMarkdown,
        editedById: user.id,
        editSummary: "Problem deleted"
      }
    });
  });

  revalidatePath("/");
  revalidatePath("/problems");
  revalidatePath(`/problems/${problem.slug}`);
  redirect("/problems");
}

export async function markProblemGoodAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:review:${user.id}`, 30, 60_000);
  if (!canSetProblemQualityStatus(user.role, QualityStatus.GOOD)) {
    throw new Error("You cannot review this problem.");
  }

  await prisma.problem.update({
    where: { id: problemId },
    data: { qualityStatus: QualityStatus.GOOD }
  });

  revalidatePath("/problems");
  revalidatePath(`/problems/${problemSlug}`);
}

export async function rollbackProblemRevisionAction(problemId: number, revisionId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:rollback:${user.id}`, 8, 60_000);
  const [revision, existingProblem] = await Promise.all([
    prisma.pageRevision.findFirst({
      where: {
        id: revisionId,
        pageType: SourceType.PROBLEM,
        pageId: problemId
      }
    }),
    prisma.problem.findUnique({
      where: { id: problemId },
      select: { authorId: true }
    })
  ]);

  if (!revision) throw new Error("Revision not found.");
  if (!existingProblem) throw new Error("Problem not found.");
  if (!canRollbackProblem(user, existingProblem)) {
    throw new Error("You cannot roll back this problem.");
  }

  const problem = await prisma.$transaction(async (tx) => {
    const current = await tx.problem.update({
      where: { id: problemId },
      data: {
        bodyMarkdown: revision.markdown,
        bodyHtml: await renderMarkdownContent(revision.markdown)
      }
    });

    await syncInternalLinks(SourceType.PROBLEM, problemId, revision.markdown, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: problemId,
        markdown: revision.markdown,
        editedById: user.id,
        editSummary: `Rolled back to revision ${revision.id}`
      }
    });

    return current;
  });

  revalidatePath(`/problems/${problem.slug}`);
  redirect(contentLanguageViewHref("/problems", problem.slug, problem.language) as Route);
}

export async function startAttemptAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`attempt:start:${user.id}`, 60, 60_000);
  const now = new Date();
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });

  await prisma.problemAttempt.createMany({
    data: translations.map((translation) => ({
      userId: user.id,
      problemId: translation.id,
      startedAt: now,
      discussionUnlockAt: unlockDate(now)
    })),
    skipDuplicates: true
  });

  revalidatePath("/problems");
  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/me");
}

async function markSolvedNow(problemId: number, problemSlug: string, user: { id: number; username: string; displayName?: string | null }) {
  const now = new Date();
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, title: true, translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });
  const translationIds = translations.map((translation) => translation.id);
  const wasAlreadySolved = Boolean(
    await prisma.problemAttempt.findFirst({
      where: { userId: user.id, problemId: { in: translationIds }, status: "SOLVED" },
      select: { id: true }
    })
  );

  await prisma.$transaction(async (tx) => {
    await tx.problemAttempt.createMany({
      data: translationIds.map((translationProblemId) => ({
        userId: user.id,
        problemId: translationProblemId,
        startedAt: now,
        discussionUnlockAt: unlockDate(now),
        status: "SOLVED" as const
      })),
      skipDuplicates: true
    });
    await tx.problemAttempt.updateMany({
      where: { userId: user.id, problemId: { in: translationIds } },
      data: { status: "SOLVED" }
    });
  });

  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/problems");
  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/me");
  if (problem.authorId !== user.id && !wasAlreadySolved) {
    await createNotification({
      userId: problem.authorId,
      actorId: user.id,
      type: NotificationType.PROBLEM_SOLVED,
      title: "Your problem was solved",
      body: `${displayNameForUser(user)} solved "${problem.title}".`,
      href: `/problems/${problemSlug}`
    });
  }
  if (!wasAlreadySolved) {
    await checkSolveAchievements(user.id);
    if (problem && problem.authorId !== user.id) {
      await checkProblemSolvedByOthersAchievements(problem.authorId);
    }
  }
}

export async function markProblemSolvedAction(problemId: number, problemSlug: string, formData?: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:solve:${user.id}`, 30, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      title: true,
      slug: true,
      authorId: true,
      verificationMode: true,
      verificationAnswer: true,
      language: true
    }
  });

  if (!problem) throw new Error("Problem not found.");

  if (problem.authorId === user.id) {
    await markSolvedNow(problemId, problemSlug, user);
    return;
  }

  if (problem.verificationMode === ProblemVerificationMode.SELF_CHECK) {
    const answer = boundedText(formData?.get("verificationAnswer"), CONTENT_LIMITS.mediumText, "Verification answer");
    if (!verificationMatches(problem.verificationAnswer, answer)) {
      redirect(contentLanguageViewHref("/problems", problemSlug, problem.language, { verification: "incorrect" }) as Route);
    }
    await markSolvedNow(problemId, problemSlug, user);
    return;
  }

  if (problem.verificationMode === ProblemVerificationMode.AUTHOR_REVIEW && problem.authorId !== user.id) {
    const answer = boundedText(formData?.get("verificationAnswer"), CONTENT_LIMITS.longNote, "Verification explanation");
    if (!answer) throw new Error("Please explain your answer before requesting review.");

    const request = await prisma.problemVerificationRequest.create({
      data: {
        problemId,
        userId: user.id,
        answer
      }
    });
    await createNotification({
      userId: problem.authorId,
      actorId: user.id,
      type: NotificationType.VERIFICATION_REQUESTED,
      title: "Solution review requested",
      body: `${displayNameForUser(user)} requested verification for "${problem.title}".`,
      href: `/problems/${problem.slug}/verification/${request.id}`
    });
    revalidatePath(`/problems/${problemSlug}`);
    return;
  }

  await markSolvedNow(problemId, problemSlug, user);
}

export async function unmarkProblemSolvedAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:unsolve:${user.id}`, 30, 60_000);

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });

  await prisma.problemAttempt.updateMany({
    where: {
      userId: user.id,
      problemId: { in: translations.map((translation) => translation.id) },
      status: "SOLVED"
    },
    data: { status: "STARTED" }
  });

  revalidatePath("/problems");
  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/me");
}

export async function reviewProblemVerificationAction(requestId: number, decision: "APPROVED" | "REJECTED") {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-review:${user.id}`, 30, 60_000);
  const request = await prisma.problemVerificationRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, slug: true, title: true, authorId: true, translationGroupId: true } }
    }
  });

  if (!request) throw new Error("Verification request not found.");
  if (!canReviewProblemVerification(user, request.problem)) {
    throw new Error("You cannot review this verification request.");
  }
  if (request.status !== "PENDING") {
    revalidatePath(`/problems/${request.problem.slug}`);
    return;
  }
  const translatedProblems = await prisma.problem.findMany({
    where: { translationGroupId: request.problem.translationGroupId },
    select: { id: true, slug: true }
  });
  const translatedProblemIds = translatedProblems.map((problem) => problem.id);

  await prisma.$transaction(async (tx) => {
    await tx.problemVerificationRequest.update({
      where: { id: request.id },
      data: {
        status: decision,
        reviewerId: user.id,
        reviewedAt: new Date()
      }
    });

    if (decision === "APPROVED") {
      const now = new Date();
      await tx.problemAttempt.createMany({
        data: translatedProblemIds.map((translatedProblemId) => ({
          userId: request.userId,
          problemId: translatedProblemId,
          startedAt: now,
          discussionUnlockAt: unlockDate(now),
          status: "SOLVED" as const
        })),
        skipDuplicates: true
      });
      await tx.problemAttempt.updateMany({
        where: { userId: request.userId, problemId: { in: translatedProblemIds } },
        data: { status: "SOLVED" }
      });
    }
  });

  if (decision === "APPROVED") {
    await checkSolveAchievements(request.userId);
    if (request.problem.authorId !== request.userId) {
      await checkProblemSolvedByOthersAchievements(request.problem.authorId);
    }
  }

  await createNotification({
    userId: request.userId,
    actorId: user.id,
    type: decision === "APPROVED" ? NotificationType.VERIFICATION_APPROVED : NotificationType.VERIFICATION_REJECTED,
    title: decision === "APPROVED" ? "Solution verified" : "Solution review rejected",
    body:
      decision === "APPROVED"
        ? `Your answer to "${request.problem.title}" was accepted.`
        : `Your answer to "${request.problem.title}" was not accepted yet.`,
    href: `/problems/${request.problem.slug}/verification/${request.id}`
  });

  revalidatePath(`/problems/${request.problem.slug}`);
  for (const translatedProblem of translatedProblems) revalidatePath(`/problems/${translatedProblem.slug}`);
  revalidatePath(`/problems/${request.problem.slug}/verification/${request.id}`);
  revalidatePath(`/profile/${request.user.username}`);
  revalidatePath("/me");
}

export async function createVerificationMessageAction(requestId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-message:${user.id}`, 20, 60_000);
  const bodyMarkdown = requiredBoundedText(
    formData.get("bodyMarkdown"),
    CONTENT_LIMITS.discussionPost,
    "Verification message"
  );
  const request = await prisma.problemVerificationRequest.findUnique({
    where: { id: requestId },
    include: {
      problem: { select: { id: true, slug: true, title: true, authorId: true } },
      user: { select: { id: true, username: true, displayName: true } }
    }
  });

  if (!request || request.problem.slug !== problemSlug) {
    throw new Error("Verification request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("This verification request is already closed.");
  }

  if (!canJoinVerificationDiscussion(user, request)) {
    throw new Error("You cannot join this verification discussion.");
  }

  await prisma.problemVerificationMessage.create({
    data: {
      requestId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  const recipientIds = new Set<number>();
  recipientIds.add(request.userId);
  recipientIds.add(request.problem.authorId);
  recipientIds.delete(user.id);

  await Promise.all(
    [...recipientIds].map((recipientId) =>
      createNotification({
        userId: recipientId,
        actorId: user.id,
        type: NotificationType.VERIFICATION_MESSAGE,
        title: "New verification message",
        body: `${displayNameForUser(user)} replied about "${request.problem.title}".`,
        href: `/problems/${request.problem.slug}/verification/${request.id}`
      })
    )
  );

  revalidatePath(`/problems/${request.problem.slug}`);
  revalidatePath(`/problems/${request.problem.slug}/verification/${request.id}`);
}

export async function updateVerificationMessageAction(messageId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-message-edit:${user.id}`, 30, 60_000);
  const bodyMarkdown = requiredBoundedText(
    formData.get("bodyMarkdown"),
    CONTENT_LIMITS.discussionPost,
    "Verification message"
  );
  const message = await prisma.problemVerificationMessage.findUnique({
    where: { id: messageId },
    include: {
      request: {
        include: {
          problem: { select: { id: true, slug: true, title: true, authorId: true } }
        }
      }
    }
  });

  if (!message || message.request.problem.slug !== problemSlug) {
    throw new Error("Verification message not found.");
  }
  if (!canJoinVerificationDiscussion(user, message.request)) {
    throw new Error("You cannot join this verification discussion.");
  }
  if (!canEditVerificationMessage(user, message)) {
    throw new Error("You cannot edit this verification message.");
  }

  await prisma.problemVerificationMessage.update({
    where: { id: message.id },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${message.request.problem.slug}`);
  revalidatePath(`/problems/${message.request.problem.slug}/verification/${message.request.id}`);
}

export async function deleteVerificationMessageAction(messageId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-message-delete:${user.id}`, 30, 60_000);
  const message = await prisma.problemVerificationMessage.findUnique({
    where: { id: messageId },
    include: {
      request: {
        include: {
          problem: { select: { id: true, slug: true, title: true, authorId: true } }
        }
      }
    }
  });

  if (!message || message.request.problem.slug !== problemSlug) {
    throw new Error("Verification message not found.");
  }
  if (!canJoinVerificationDiscussion(user, message.request)) {
    throw new Error("You cannot join this verification discussion.");
  }
  if (!canEditVerificationMessage(user, message)) {
    throw new Error("You cannot delete this verification message.");
  }

  await prisma.problemVerificationMessage.delete({ where: { id: message.id } });

  revalidatePath(`/problems/${message.request.problem.slug}`);
  revalidatePath(`/problems/${message.request.problem.slug}/verification/${message.request.id}`);
}

export async function toggleProblemFavoriteAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`favorite:${user.id}`, 60, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, translationGroupId: true }
  });

  if (!problem || problem.authorId === user.id) {
    revalidatePath(`/problems/${problemSlug}`);
    return;
  }

  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });
  const translationIds = translations.map((translation) => translation.id);
  const existing = await prisma.problemFavorite.findFirst({
    where: { userId: user.id, problemId: { in: translationIds } },
    select: { problemId: true }
  });

  if (existing) {
    await prisma.problemFavorite.deleteMany({
      where: { userId: user.id, problemId: { in: translationIds } }
    });
  } else {
    await prisma.problemFavorite.createMany({
      data: translationIds.map((translationProblemId) => ({
        userId: user.id,
        problemId: translationProblemId
      })),
      skipDuplicates: true
    });
  }

  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/problems");
  revalidatePath("/");
  revalidatePath("/tips");
  revalidatePath("/users");
  revalidatePath(`/profile/${user.username}`);
  revalidatePath(`/profile/${user.username}?view=favorites`);
  revalidatePath("/me");
}

export async function createDiscussionPostAction(
  problemId: number,
  returnToDiscussionOrFormData: boolean | FormData,
  maybeFormData?: FormData
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`post:${user.id}`, 12, 60_000);
  const returnToDiscussion = typeof returnToDiscussionOrFormData === "boolean" ? returnToDiscussionOrFormData : false;
  const formData =
    typeof returnToDiscussionOrFormData === "boolean" ? maybeFormData : returnToDiscussionOrFormData;
  if (!(formData instanceof FormData)) throw new Error("Discussion message is missing.");
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      slug: true,
      title: true,
      authorId: true,
      translationGroupId: true,
      thread: { select: { id: true } }
    }
  });

  if (!problem) throw new Error("Problem not found.");
  const attempt = await prisma.problemAttempt.findFirst({
    where: { userId: user.id, problem: { translationGroupId: problem.translationGroupId } },
    orderBy: { discussionUnlockAt: "asc" }
  });
  if (!canJoinProblemDiscussion(user, problem, attempt)) {
    throw new Error("Start this problem before joining the discussion.");
  }

  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Discussion message");
  const typeInput = String(formData.get("type") ?? "COMMENT").toUpperCase();
  const type = Object.values(PostType).includes(typeInput as PostType) ? (typeInput as PostType) : PostType.COMMENT;
  const thread =
    problem.thread ??
    (await prisma.discussionThread.upsert({
      where: { problemId },
      update: {},
      create: { problemId },
      select: { id: true }
    }));
  await prisma.discussionPost.create({
    data: {
      threadId: thread.id,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      type
    }
  });

  revalidatePath("/problems");
  revalidatePath(`/problems/${problem.slug}`);
  revalidatePath(`/problems/${problem.slug}/discussion`);
  if (type === PostType.HINT) {
    await checkHintAchievements(user.id);
  }
  await notifyProblemAuthor({
    problemId,
    actorId: user.id,
    type: NotificationType.DISCUSSION_POSTED,
    title: "New discussion message",
    body: `${displayNameForUser(user)} posted in the discussion of "${problem.title}".`,
    href: `/problems/${problem.slug}/discussion`
  });
  redirect(returnToDiscussion ? (`/problems/${problem.slug}/discussion` as Route) : `/problems/${problem.slug}`);
}

export async function updateHintAction(
  postId: number,
  problemSlug: string,
  returnToDiscussionOrFormData: boolean | FormData,
  maybeFormData?: FormData
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`hint:update:${user.id}`, 30, 60_000);
  const returnToDiscussion = typeof returnToDiscussionOrFormData === "boolean" ? returnToDiscussionOrFormData : false;
  const formData =
    typeof returnToDiscussionOrFormData === "boolean" ? maybeFormData : returnToDiscussionOrFormData;
  if (!(formData instanceof FormData)) throw new Error("Hint content is missing.");
  const hint = await prisma.discussionPost.findFirst({
    where: {
      id: postId,
      type: PostType.HINT,
      deletedAt: null,
      thread: { problem: { slug: problemSlug } }
    },
    select: { id: true, authorId: true }
  });

  if (!hint) throw new Error("Hint not found.");
  if (!canEditDiscussionHint(user, hint)) {
    throw new Error("You cannot edit this hint.");
  }

  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Hint");
  await prisma.discussionPost.update({
    where: { id: hint.id },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/discussion`);
  redirect(returnToDiscussion ? (`/problems/${problemSlug}/discussion` as Route) : `/problems/${problemSlug}`);
}

export async function deleteHintAction(postId: number, problemSlug: string, returnToDiscussion = false) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`hint:delete:${user.id}`, 30, 60_000);
  const hint = await prisma.discussionPost.findFirst({
    where: {
      id: postId,
      type: PostType.HINT,
      deletedAt: null,
      thread: { problem: { slug: problemSlug } }
    },
    select: { id: true, authorId: true }
  });

  if (!hint) throw new Error("Hint not found.");
  if (!canEditDiscussionHint(user, hint)) {
    throw new Error("You cannot delete this hint.");
  }

  await prisma.discussionPost.update({
    where: { id: hint.id },
    data: { deletedAt: new Date() }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/discussion`);
  redirect(returnToDiscussion ? (`/problems/${problemSlug}/discussion` as Route) : `/problems/${problemSlug}`);
}

export async function votePostAction(postId: number, problemSlug: string, returnToDiscussion = false) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);
  const key = {
    userId: user.id,
    targetType: TargetType.POST,
    targetId: postId
  };
  const existing = await prisma.vote.findUnique({
    where: { userId_targetType_targetId: key }
  });

  let voteAdded = false;
  if (existing) {
    await prisma.vote.delete({ where: { userId_targetType_targetId: key } });
  } else {
    await prisma.vote.create({ data: { ...key, voteType: VoteType.UP } });
    voteAdded = true;
  }

  if (voteAdded) {
    const post = await prisma.discussionPost.findUnique({
      where: { id: postId },
      select: { authorId: true }
    });
    if (post) {
      await checkUsefulPostAchievements(post.authorId);
    }
  }

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/discussion`);
  if (returnToDiscussion) redirect(`/problems/${problemSlug}/discussion` as Route);
}

export async function voteProblemAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);
  const key = {
    userId: user.id,
    targetType: TargetType.PROBLEM,
    targetId: problemId
  };
  const existing = await prisma.vote.findUnique({
    where: { userId_targetType_targetId: key }
  });

  if (existing) {
    await prisma.vote.delete({ where: { userId_targetType_targetId: key } });
  } else {
    await prisma.vote.create({ data: { ...key, voteType: VoteType.UP } });
  }

  revalidatePath("/problems");
}
