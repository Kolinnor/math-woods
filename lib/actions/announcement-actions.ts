"use server";

import { NotificationType } from "@prisma/client";
import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit, isRateLimitError } from "@/lib/rate-limit";
import { AnnouncementInputError, announcementPollCopy, parseAnnouncementPoll } from "@/lib/announcement-polls";
import type { FormFeedbackState } from "@/lib/form-feedback";
import { acquireTransactionLock } from "@/lib/transaction-lock";
import { displayNameForUser } from "@/lib/user-display";

export async function createAnnouncementAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertRateLimit(`announcement:create:${admin.id}`, 10, 60 * 60_000);

  const title = String(formData.get("title") ?? "").trim();
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  if (!title || title.length > CONTENT_LIMITS.title || !bodyMarkdown || bodyMarkdown.length > CONTENT_LIMITS.longNote) {
    throw new AnnouncementInputError("invalidContent");
  }
  const poll = parseAnnouncementPoll(formData);

  const { renderMarkdown } = await import("@/lib/markdown");
  const bodyHtml = await renderMarkdown(bodyMarkdown);

  await prisma.announcement.create({
    data: { title, bodyMarkdown, bodyHtml, createdById: admin.id,
      ...(poll ? { pollQuestion: poll.question, pollOptions: {
        create: poll.options.map((label, position) => ({ label, position }))
      } } : {})
    }
  });

  revalidatePath("/", "layout");
  revalidatePath("/announcements");
  redirect("/announcements?announcementPosted=1" as Route);
}

function pollFormError(error: unknown, locale: "fr" | "en"): FormFeedbackState {
  const copy = announcementPollCopy[locale] ?? announcementPollCopy.en;
  if (error instanceof AnnouncementInputError) return { error: copy[error.reason] };
  if (isRateLimitError(error)) return { error: copy.rateLimit };
  throw error;
}

export async function createAnnouncementFormAction(locale: "fr" | "en", _state: FormFeedbackState, formData: FormData): Promise<FormFeedbackState> {
  try {
    await createAnnouncementAction(formData);
    return { error: "" };
  } catch (error) { return pollFormError(error, locale); }
}

export async function voteAnnouncementPollAction(announcementId: number, locale: "fr" | "en", _state: FormFeedbackState, formData: FormData): Promise<FormFeedbackState> {
  const user = await requireVerifiedUser();
  try {
    await assertRateLimit(`announcement:poll-vote:${user.id}`, 30, 60_000);
    const optionId = Number(formData.get("optionId"));
    if (!Number.isSafeInteger(optionId) || optionId < 1) throw new AnnouncementInputError("invalidVote");
    await prisma.$transaction(async tx => {
      // Voting, closing and deletion share a lock, so a stale form cannot vote after closure.
      await acquireTransactionLock(tx, `announcement-poll:${announcementId}`);
      const poll = await tx.announcement.findUnique({ where: { id: announcementId }, select: {
        pollQuestion: true, pollClosedAt: true, pollOptions: { select: { id: true } }
      } });
      if (!poll?.pollQuestion || poll.pollClosedAt) throw new AnnouncementInputError("unavailable");
      if (!poll.pollOptions.some(option => option.id === optionId)) throw new AnnouncementInputError("invalidVote");
      await tx.announcementPollVote.upsert({
        where: { announcementId_userId: { announcementId, userId: user.id } },
        create: { announcementId, userId: user.id, optionId },
        update: { optionId }
      });
    });
    revalidatePath("/announcements");
    return { error: "" };
  } catch (error) { return pollFormError(error, locale); }
}

export async function setAnnouncementPollClosedAction(announcementId: number, closed: boolean, locale: "fr" | "en", _state: FormFeedbackState, _formData: FormData): Promise<FormFeedbackState> {
  const admin = await requireAdmin();
  try {
    await assertRateLimit(`announcement:poll-close:${admin.id}`, 30, 60_000);
    await prisma.$transaction(async tx => {
      await acquireTransactionLock(tx, `announcement-poll:${announcementId}`);
      const poll = await tx.announcement.findUnique({ where: { id: announcementId }, select: { pollQuestion: true } });
      if (!poll?.pollQuestion) throw new AnnouncementInputError("unavailable");
      await tx.announcement.update({ where: { id: announcementId }, data: { pollClosedAt: closed ? new Date() : null } });
    });
    revalidatePath("/announcements");
    return { error: "" };
  } catch (error) { return pollFormError(error, locale); }
}

export async function deleteAnnouncementAction(announcementId: number) {
  const admin = await requireAdmin();
  await assertRateLimit(`announcement:delete:${admin.id}`, 20, 60 * 60_000);

  await prisma.$transaction(async tx => {
    await acquireTransactionLock(tx, `announcement-poll:${announcementId}`);
    await tx.announcement.delete({ where: { id: announcementId } });
  });

  revalidatePath("/", "layout");
  revalidatePath("/announcements");
}

export async function markAnnouncementsSeenAction() {
  const user = await requireVerifiedUser();
  await assertRateLimit(`announcement:seen:${user.id}`, 30, 60_000);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastSeenAnnouncementAt: new Date() }
  });
  revalidatePath("/");
}

export async function toggleAnnouncementLikeAction(announcementId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`announcement:like:${user.id}`, 60, 60_000);

  const existing = await prisma.announcementLike.findUnique({
    where: { userId_announcementId: { userId: user.id, announcementId } }
  });

  if (existing) {
    await prisma.announcementLike.delete({
      where: { userId_announcementId: { userId: user.id, announcementId } }
    });
  } else {
    await prisma.announcementLike.create({
      data: { userId: user.id, announcementId }
    });
  }

  revalidatePath("/announcements");
}

export async function createAnnouncementCommentAction(announcementId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`announcement:comment:${user.id}`, 20, 60_000);

  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Comment");
  const announcement = await prisma.announcement.findUnique({
    where: { id: announcementId },
    select: { title: true, createdById: true }
  });
  if (!announcement) throw new Error("Announcement not found.");

  const { renderMarkdown } = await import("@/lib/markdown");
  const bodyHtml = await renderMarkdown(bodyMarkdown);

  const comment = await prisma.announcementComment.create({
    data: { announcementId, authorId: user.id, bodyMarkdown, bodyHtml }
  });

  revalidatePath("/announcements");

  if (announcement.createdById) {
    await createNotification({
      userId: announcement.createdById,
      actorId: user.id,
      type: NotificationType.ANNOUNCEMENT_COMMENTED,
      title: "New comment on your announcement",
      body: `${displayNameForUser(user)} commented on "${announcement.title}".`,
      href: `/announcements#comment-${comment.id}`
    });
  }

  redirect(`/announcements#comment-${comment.id}` as Route);
}

export async function deleteAnnouncementCommentAction(commentId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`announcement:comment:delete:${user.id}`, 30, 60_000);

  const comment = await prisma.announcementComment.findUnique({
    where: { id: commentId },
    select: { authorId: true }
  });
  if (!comment) return;
  if (comment.authorId !== user.id && !canUseAdminTools(user)) {
    throw new Error("You can't delete this comment.");
  }

  await prisma.announcementComment.delete({ where: { id: commentId } });
  revalidatePath("/announcements");
}
