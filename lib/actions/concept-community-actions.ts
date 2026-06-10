"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createConceptTalkPostAction(conceptId: number, conceptSlug: string, formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`concept-talk:${user.id}`, 8, 60_000);
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();

  if (!bodyMarkdown) throw new Error("Discussion message cannot be empty.");

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

export async function toggleConceptWatchAction(conceptId: number, conceptSlug: string) {
  const user = await requireUser();
  const key = { userId: user.id, conceptId };
  const existing = await prisma.conceptWatch.findUnique({
    where: { userId_conceptId: key }
  });

  if (existing) {
    await prisma.conceptWatch.delete({ where: { userId_conceptId: key } });
  } else {
    await prisma.conceptWatch.create({ data: key });
  }

  revalidatePath(`/concepts/${conceptSlug}`);
  revalidatePath("/watchlist");
}
