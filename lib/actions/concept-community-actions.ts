"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createConceptTalkPostAction(conceptId: number, conceptSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept-talk:${user.id}`, 8, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Discussion message");

  await prisma.conceptTalkPost.create({
    data: {
      conceptId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/concepts/${conceptSlug}/talk`);
  revalidatePath(`/concepts/${conceptSlug}`);
}
