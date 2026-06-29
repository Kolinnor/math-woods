"use server";

import type { Route } from "next";
import {
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
  checkProofAchievements,
  checkSolveAchievements,
  checkUsefulPostAchievements
} from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { unlockDate } from "@/lib/attempts";
import { prisma } from "@/lib/db";
import { boundedText, CONTENT_LIMITS, optionalBoundedText, requiredBoundedText } from "@/lib/content-limits";
import { syncInternalLinks } from "@/lib/internal-links";
import { createNotification, notifyProblemAuthor } from "@/lib/notifications";
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
  canEditPlaylist,
  canEditProblem,
  canJoinProblemDiscussion,
  canJoinVerificationDiscussion,
  canReviewProblemVerification,
  canRollbackProblem,
  canSetProblemQualityStatus
} from "@/lib/permissions";
import { ensureSlug } from "@/lib/slug";
import { syncProblemSpoilerTags, syncProblemTags } from "@/lib/tags";
import { uniqueSlug } from "@/lib/unique-slug";
import { displayNameForUser } from "@/lib/user-display";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createProblemAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:create:${user.id}`, 5, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const translationGroupId = parseTranslationGroupId(formData.get("translationGroupId"));
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement");
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
  const addToPlaylistSlug = ensureSlug(String(formData.get("addToPlaylistSlug") ?? ""), "");
  const parentProblemSlug = ensureSlug(String(formData.get("parentProblemSlug") ?? ""), "");
  const qualityStatus = QualityStatus.UNREVIEWED;
  const tags = tagsWithConjecture(boundedText(formData.get("tags"), CONTENT_LIMITS.tagList, "Tags"), formData.get("conjecture"));
  const spoilerTags = boundedText(formData.get("spoilerTags"), CONTENT_LIMITS.tagList, "Spoiler tags");
  const relatedProblemGroups = boundedText(
    formData.get("relatedProblemGroups"),
    CONTENT_LIMITS.relationGroups,
    "Related problem groups"
  );
  const proofMarkdown = boundedText(formData.get("proofMarkdown"), CONTENT_LIMITS.markdown, "Initial solution");

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

    const created = await tx.problem.create({
      data: {
        slug,
        language,
        ...(translationGroupId ? { translationGroupId } : {}),
        title,
        bodyMarkdown,
        bodyHtml,
        difficulty,
        domain,
        origin,
        originChapter,
        originPage,
        originNote,
        listed,
        qualityStatus,
        verificationMode,
        verificationPrompt: verificationMode === ProblemVerificationMode.NONE ? null : verificationPrompt,
        verificationAnswer: verificationMode === ProblemVerificationMode.SELF_CHECK ? verificationAnswer : null,
        authorId: user.id,
        thread: { create: {} }
      }
    });
    await tx.problemFavorite.create({
      data: {
        userId: user.id,
        problemId: created.id
      }
    });
    if (addToPlaylistSlug) {
      const playlist = await tx.playlist.findUnique({
        where: { slug: addToPlaylistSlug },
        select: { id: true, authorId: true }
      });
      if (playlist && canEditPlaylist(user, playlist)) {
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
    await syncInternalLinks(SourceType.PROBLEM, created.id, bodyMarkdown, tx);
    await syncProblemDomains(tx, created.id, domains);
    await syncProblemRelationGroups(tx, created.id, relatedProblemGroups);
    await syncProblemTags(created.id, tags, tx);
    await syncProblemSpoilerTags(created.id, spoilerTags, tx);
    if (proofMarkdown) {
      await tx.problemProof.create({
        data: {
          problemId: created.id,
          authorId: user.id,
          bodyMarkdown: proofMarkdown,
          bodyHtml: await renderMarkdownContent(proofMarkdown)
        }
      });
    }
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
  if (proofMarkdown) {
    await checkProofAchievements(user.id);
  }
  redirect(`/problems/${problem.slug}`);
}

export async function updateProblemAction(problemId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:update:${user.id}`, 20, 60_000);
  const previous = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, slug: true, title: true, qualityStatus: true }
  });
  if (!previous) throw new Error("Problem not found.");
  if (!canEditProblem(user, previous)) {
    throw new Error("You cannot edit this problem.");
  }

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const language = parseContentLanguage(formData.get("language"));
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement");
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
  const qualityStatusInput = formData.get("qualityStatus");
  const qualityStatus = qualityStatusInput
    ? parseContributorQualityStatus(qualityStatusInput, user.role)
    : previous.qualityStatus;
  const tags = tagsWithConjecture(boundedText(formData.get("tags"), CONTENT_LIMITS.tagList, "Tags"), formData.get("conjecture"));
  const spoilerTags = boundedText(formData.get("spoilerTags"), CONTENT_LIMITS.tagList, "Spoiler tags");
  const editSummary = boundedText(formData.get("editSummary"), CONTENT_LIMITS.shortText, "Edit summary") || "Problem edited";
  const relatedProblemGroups = boundedText(
    formData.get("relatedProblemGroups"),
    CONTENT_LIMITS.relationGroups,
    "Related problem groups"
  );

  if (verificationMode === ProblemVerificationMode.SELF_CHECK && !verificationAnswer) {
    throw new Error("Short answer verification requires an expected answer.");
  }

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  const problem = await prisma.$transaction(async (tx) => {
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
        qualityStatus,
        verificationMode,
        verificationPrompt: verificationMode === ProblemVerificationMode.NONE ? null : verificationPrompt,
        verificationAnswer: verificationMode === ProblemVerificationMode.SELF_CHECK ? verificationAnswer : null
      }
    });

    await syncInternalLinks(SourceType.PROBLEM, updated.id, bodyMarkdown, tx);
    await syncProblemDomains(tx, updated.id, domains);
    await syncProblemRelationGroups(tx, updated.id, relatedProblemGroups);
    await syncProblemTags(updated.id, tags, tx);
    await syncProblemSpoilerTags(updated.id, spoilerTags, tx);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: updated.id,
        markdown: bodyMarkdown,
        editedById: user.id,
        editSummary
      }
    });

    return updated;
  });

  revalidatePath("/");
  revalidatePath(`/problems/${problem.slug}`);
  if (previous.authorId !== user.id) {
    await createNotification({
      userId: previous.authorId,
      actorId: user.id,
      type: NotificationType.PROBLEM_EDITED,
      title: "Your problem was edited",
      body: `${displayNameForUser(user)} edited "${previous.title}".`,
      href: `/problems/${problem.slug}`
    });
  }
  redirect(`/problems/${problem.slug}`);
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
  redirect(`/problems/${problem.slug}`);
}

export async function startAttemptAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`attempt:start:${user.id}`, 60, 60_000);
  const now = new Date();

  await prisma.problemAttempt.upsert({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    update: {},
    create: {
      userId: user.id,
      problemId,
      startedAt: now,
      discussionUnlockAt: unlockDate(now)
    }
  });

  revalidatePath("/problems");
  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath("/me");
}

export async function updatePrivateNotesAction(problemId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`private-notes:${user.id}`, 30, 60_000);
  const privateNotesMarkdown = boundedText(
    formData.get("privateNotesMarkdown"),
    CONTENT_LIMITS.privateNotes,
    "Private notes",
    { trim: false }
  );
  const status = String(formData.get("status") ?? "STARTED") as
    | "STARTED"
    | "BLOCKED"
    | "SOLVED"
    | "REVIEW_LATER";
  const previousAttempt = await prisma.problemAttempt.findUnique({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    select: { status: true }
  });
  const problem =
    status === "SOLVED" && previousAttempt?.status !== "SOLVED"
      ? await prisma.problem.findUnique({
          where: { id: problemId },
          select: { authorId: true, slug: true, title: true, verificationMode: true }
        })
      : null;

  if (status === "SOLVED" && problem?.verificationMode !== ProblemVerificationMode.NONE) {
    throw new Error("This problem requires verification before it can be marked as solved.");
  }

  await prisma.problemAttempt.update({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    data: { privateNotesMarkdown, status }
  });

  revalidatePath("/problems");
  if (problem && problem.authorId !== user.id) {
    await createNotification({
      userId: problem.authorId,
      actorId: user.id,
      type: NotificationType.PROBLEM_SOLVED,
      title: "Your problem was solved",
      body: `${displayNameForUser(user)} solved "${problem.title}".`,
      href: `/problems/${problem.slug}`
    });
  }
  if (status === "SOLVED" && previousAttempt?.status !== "SOLVED") {
    await checkSolveAchievements(user.id);
    if (problem && problem.authorId !== user.id) {
      await checkProblemSolvedByOthersAchievements(problem.authorId);
    }
  }
}

async function markSolvedNow(problemId: number, problemSlug: string, user: { id: number; username: string; displayName?: string | null }) {
  const now = new Date();
  const previousAttempt = await prisma.problemAttempt.findUnique({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    select: { status: true }
  });
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, title: true }
  });

  await prisma.problemAttempt.upsert({
    where: {
      userId_problemId: {
        userId: user.id,
        problemId
      }
    },
    update: { status: "SOLVED" },
    create: {
      userId: user.id,
      problemId,
      startedAt: now,
      discussionUnlockAt: unlockDate(now),
      status: "SOLVED"
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/me");
  if (problem && problem.authorId !== user.id && previousAttempt?.status !== "SOLVED") {
    await createNotification({
      userId: problem.authorId,
      actorId: user.id,
      type: NotificationType.PROBLEM_SOLVED,
      title: "Your problem was solved",
      body: `${displayNameForUser(user)} solved "${problem.title}".`,
      href: `/problems/${problemSlug}`
    });
  }
  if (previousAttempt?.status !== "SOLVED") {
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
      verificationAnswer: true
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
      redirect(`/problems/${problemSlug}?verification=incorrect`);
    }
    await markSolvedNow(problemId, problemSlug, user);
    return;
  }

  if (problem.verificationMode === ProblemVerificationMode.AUTHOR_REVIEW && problem.authorId !== user.id) {
    const answer = boundedText(formData?.get("verificationAnswer"), CONTENT_LIMITS.longNote, "Verification explanation");
    if (!answer) throw new Error("Please explain your answer before requesting review.");

    await prisma.problemVerificationRequest.create({
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
      href: `/problems/${problem.slug}`
    });
    revalidatePath(`/problems/${problemSlug}`);
    return;
  }

  await markSolvedNow(problemId, problemSlug, user);
}

export async function reviewProblemVerificationAction(requestId: number, decision: "APPROVED" | "REJECTED") {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-review:${user.id}`, 30, 60_000);
  const request = await prisma.problemVerificationRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, slug: true, title: true, authorId: true } }
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
      await tx.problemAttempt.upsert({
        where: { userId_problemId: { userId: request.userId, problemId: request.problemId } },
        update: { status: "SOLVED" },
        create: {
          userId: request.userId,
          problemId: request.problemId,
          startedAt: new Date(),
          discussionUnlockAt: unlockDate(new Date()),
          status: "SOLVED"
        }
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
    href: `/problems/${request.problem.slug}`
  });

  revalidatePath(`/problems/${request.problem.slug}`);
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
        href: `/problems/${request.problem.slug}`
      })
    )
  );

  revalidatePath(`/problems/${request.problem.slug}`);
}

export async function toggleProblemFavoriteAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`favorite:${user.id}`, 60, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true }
  });

  if (!problem || problem.authorId === user.id) {
    revalidatePath(`/problems/${problemSlug}`);
    return;
  }

  const key = { userId: user.id, problemId };
  const existing = await prisma.problemFavorite.findUnique({
    where: { userId_problemId: key }
  });

  if (existing) {
    await prisma.problemFavorite.delete({ where: { userId_problemId: key } });
  } else {
    await prisma.problemFavorite.create({ data: key });
  }

  revalidatePath(`/problems/${problemSlug}`);
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
  const [attempt, problem] = await Promise.all([
    prisma.problemAttempt.findUnique({
      where: {
        userId_problemId: {
          userId: user.id,
          problemId
        }
      }
    }),
    prisma.problem.findUnique({
      where: { id: problemId },
      select: { slug: true, title: true, authorId: true, thread: { select: { id: true } } }
    })
  ]);

  if (!problem) throw new Error("Problem not found.");
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
