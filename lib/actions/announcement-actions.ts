"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

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
