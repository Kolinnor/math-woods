"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner, requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

const SITE_ANNOUNCEMENT_ROLES = new Set<Role>(Object.values(Role));

function requestedAudienceRoles(formData: FormData) {
  return [...new Set(formData.getAll("audienceRoles").map(String))]
    .filter((role): role is Role => SITE_ANNOUNCEMENT_ROLES.has(role as Role));
}

export async function sendSiteAnnouncementAction(formData: FormData) {
  const owner = await requireOwner();
  await assertRateLimit(`site-announcement:create:${owner.id}`, 10, 60 * 60_000);

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.longNote, "Message");
  const audienceRoles = requestedAudienceRoles(formData);
  if (audienceRoles.length === 0) {
    redirect("/moderation?announcementError=audience#site-announcements");
  }

  const { renderMarkdown } = await import("@/lib/markdown");
  const bodyHtml = await renderMarkdown(bodyMarkdown);
  const recipientCount = await prisma.$transaction(async (tx) => {
    const recipients = await tx.user.findMany({
      where: {
        deletedAt: null,
        role: { in: audienceRoles }
      },
      select: { id: true }
    });
    if (recipients.length === 0) return 0;

    const announcement = await tx.siteAnnouncement.create({
      data: {
        title,
        bodyMarkdown,
        bodyHtml,
        audienceRoles,
        createdById: owner.id
      },
      select: { id: true }
    });
    await tx.siteAnnouncementRecipient.createMany({
      data: recipients.map(({ id: userId }) => ({ announcementId: announcement.id, userId }))
    });
    return recipients.length;
  });

  if (recipientCount === 0) {
    redirect("/moderation?announcementError=recipients#site-announcements");
  }
  revalidatePath("/", "layout");
  revalidatePath("/moderation");
  redirect(`/moderation?announcementSent=${recipientCount}#site-announcements`);
}

export async function cancelSiteAnnouncementAction(announcementId: number) {
  const owner = await requireOwner();
  await assertRateLimit(`site-announcement:cancel:${owner.id}`, 20, 60 * 60_000);

  await prisma.siteAnnouncement.updateMany({
    where: { id: announcementId, cancelledAt: null },
    data: { cancelledAt: new Date() }
  });
  revalidatePath("/", "layout");
  revalidatePath("/moderation");
}

export async function acknowledgeSiteAnnouncementAction(announcementId: number) {
  const user = await requireUser();
  await assertRateLimit(`site-announcement:acknowledge:${user.id}`, 60, 60_000);

  await prisma.siteAnnouncementRecipient.updateMany({
    where: {
      announcementId,
      userId: user.id,
      acknowledgedAt: null,
      announcement: { cancelledAt: null }
    },
    data: { acknowledgedAt: new Date() }
  });
  revalidatePath("/", "layout");
}
