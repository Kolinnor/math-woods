"use server";

import {
  NotificationType,
  PostType,
  ProblemStatus,
  ProblemVerificationMode,
  QualityStatus,
  SourceType,
  TargetType,
  VoteType
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireVerifiedUser } from "@/lib/auth";
import { unlockDate } from "@/lib/attempts";
import { prisma } from "@/lib/db";
import { boundedText, CONTENT_LIMITS, optionalBoundedText, requiredBoundedText } from "@/lib/content-limits";
import { syncInternalLinks } from "@/lib/internal-links";
import { createNotification, notifyProblemAuthor } from "@/lib/notifications";
import { parseProblemDomains, syncProblemDomains } from "@/lib/problem-domains";
import { linkSpecificProblem, syncProblemRelationGroups } from "@/lib/problem-relations";
import {
  parseProblemVerificationMode,
  verificationMatches
} from "@/lib/problem-verification";
import { parseProblemDifficulty, tagsWithConjecture } from "@/lib/problems";
import { parseContributorQualityStatus } from "@/lib/quality";
import { assertRateLimit } from "@/lib/rate-limit";
import { canAdminister, canModerate } from "@/lib/roles";
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
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement");
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domains = parseProblemDomains(formData.getAll("domains"), formData.get("domain"));
  const domain = domains[0];
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
  const qualityStatus = parseContributorQualityStatus(formData.get("qualityStatus"), user.role);
  const tags = tagsWithConjecture(boundedText(formData.get("tags"), CONTENT_LIMITS.tagList, "Tags"), formData.get("conjecture"));
  const spoilerTags = boundedText(formData.get("spoilerTags"), CONTENT_LIMITS.tagList, "Spoiler tags");
  const proofMarkdown = boundedText(formData.get("proofMarkdown"), CONTENT_LIMITS.markdown, "Initial proof");

  if (verificationMode === ProblemVerificationMode.SELF_CHECK && !verificationAnswer) {
    throw new Error("Short answer verification requires an expected answer.");
  }

  const slug = await uniqueSlug("problem", title);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const problem = await prisma.$transaction(async (tx) => {
    const created = await tx.problem.create({
      data: {
        slug,
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
      if (playlist && (playlist.authorId === user.id || canModerate(user.role))) {
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
      if (parentProblem && (parentProblem.authorId === user.id || canModerate(user.role))) {
        await linkSpecificProblem(tx, parentProblem.id, created.id);
      }
    }
    await syncInternalLinks(SourceType.PROBLEM, created.id, bodyMarkdown, tx);
    await syncProblemDomains(tx, created.id, domains);
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
  redirect(`/problems/${problem.slug}`);
}

export async function updateProblemAction(problemId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:update:${user.id}`, 20, 60_000);
  const previous = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, slug: true, title: true }
  });
  if (!previous) throw new Error("Problem not found.");
  if (previous.authorId !== user.id && !canModerate(user.role)) {
    throw new Error("You cannot edit this problem.");
  }

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement");
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domains = parseProblemDomains(formData.getAll("domains"), formData.get("domain"));
  const domain = domains[0];
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
  const qualityStatus = parseContributorQualityStatus(formData.get("qualityStatus"), user.role);
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
  const user = await requireUser();
  await assertRateLimit(`problem:delete:${user.id}`, 10, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, slug: true, authorId: true, bodyMarkdown: true, status: true }
  });

  if (!problem) throw new Error("Problem not found.");
  if (!canAdminister(user.role)) {
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
  const user = await requireUser();
  await assertRateLimit(`problem:review:${user.id}`, 30, 60_000);
  if (!canModerate(user.role)) {
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
  if (existingProblem.authorId !== user.id && !canModerate(user.role)) {
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
  const user = await requireUser();
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
  const user = await requireUser();
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
}

export async function markProblemSolvedAction(problemId: number, problemSlug: string, formData?: FormData) {
  const user = await requireUser();
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

  if (problem.verificationMode === ProblemVerificationMode.SELF_CHECK) {
    const answer = boundedText(formData?.get("verificationAnswer"), CONTENT_LIMITS.mediumText, "Verification answer");
    if (!verificationMatches(problem.verificationAnswer, answer)) {
      throw new Error("The verification answer is not correct.");
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
  const user = await requireUser();
  await assertRateLimit(`verification-review:${user.id}`, 30, 60_000);
  const request = await prisma.problemVerificationRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, slug: true, title: true, authorId: true } }
    }
  });

  if (!request) throw new Error("Verification request not found.");
  if (request.problem.authorId !== user.id && !canModerate(user.role)) {
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

export async function toggleProblemFavoriteAction(problemId: number, problemSlug: string) {
  const user = await requireUser();
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
  revalidatePath(`/profile/${user.username}`);
}

export async function createDiscussionPostAction(threadId: number, problemId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`post:${user.id}`, 12, 60_000);
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
      select: { slug: true, title: true }
    })
  ]);

  if (!attempt) {
    throw new Error("Start this problem before joining the discussion.");
  }
  if (!problem) throw new Error("Problem not found.");

  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Discussion message");
  const typeInput = String(formData.get("type") ?? "COMMENT").toUpperCase();
  const type = Object.values(PostType).includes(typeInput as PostType) ? (typeInput as PostType) : PostType.COMMENT;
  await prisma.discussionPost.create({
    data: {
      threadId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      type
    }
  });

  revalidatePath("/problems");
  await notifyProblemAuthor({
    problemId,
    actorId: user.id,
    type: NotificationType.DISCUSSION_POSTED,
    title: "New discussion message",
    body: `${displayNameForUser(user)} posted in the discussion of "${problem.title}".`,
    href: `/problems/${problem.slug}`
  });
}

export async function votePostAction(postId: number, problemSlug: string) {
  const user = await requireUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);

  await prisma.vote.upsert({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: TargetType.POST,
        targetId: postId
      }
    },
    update: { voteType: VoteType.UP },
    create: {
      userId: user.id,
      targetType: TargetType.POST,
      targetId: postId,
      voteType: VoteType.UP
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
}

export async function voteProblemAction(problemId: number) {
  const user = await requireUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);

  await prisma.vote.upsert({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: TargetType.PROBLEM,
        targetId: problemId
      }
    },
    update: { voteType: VoteType.UP },
    create: {
      userId: user.id,
      targetType: TargetType.PROBLEM,
      targetId: problemId,
      voteType: VoteType.UP
    }
  });

  revalidatePath("/problems");
}
