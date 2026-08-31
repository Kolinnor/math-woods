"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
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
  redirect("/announcements?announcementPosted=1");
}
