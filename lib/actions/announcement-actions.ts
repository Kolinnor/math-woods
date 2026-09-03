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
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";

export async function createAnnouncementAction(formData: FormData) {
  const admin = await requireAdmin();
  await assertRateLimit(`announcement:create:${admin.id}`, 10, 60 * 60_000);

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.longNote, "Message");

  const { renderMarkdown } = await import("@/lib/markdown");
  const bodyHtml = await renderMarkdown(bodyMarkdown);

  await prisma.announcement.create({
    data: { title, bodyMarkdown, bodyHtml, createdById: admin.id }
  });

  revalidatePath("/", "layout");
  revalidatePath("/announcements");
  redirect("/announcements?announcementPosted=1" as Route);
}

export async function deleteAnnouncementAction(announcementId: number) {
  const admin = await requireAdmin();
  await assertRateLimit(`announcement:delete:${admin.id}`, 20, 60 * 60_000);

  await prisma.announcement.delete({ where: { id: announcementId } });

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
