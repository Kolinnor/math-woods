"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { notifyDiscussionFollowers } from "@/lib/discussion-follows";
import { resolveDiscussionReply } from "@/lib/discussion-replies";
import { acknowledgeCitationDraft } from "@/lib/citation-draft-receipt";
import { displayNameForUser } from "@/lib/user-display";
import { canEditConceptTalkPost } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createConceptTalkPostAction(conceptId: number, conceptSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept-talk:${user.id}`, 8, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Discussion message");

  const concept = await prisma.concept.findFirst({ where: { id: conceptId, slug: conceptSlug }, select: { title: true } });
  if (!concept) throw new Error("Concept not found.");
  const parent = await resolveDiscussionReply({ kind: "concept", id: conceptId }, formData.get("parentId"), user);
  const post = await prisma.conceptTalkPost.create({
    data: {
      parentId: parent?.id,
      conceptId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  if (parent) await acknowledgeCitationDraft(formData);
  await notifyDiscussionFollowers({
    target: { kind: "concept", id: conceptId },
    replyToAuthorId: parent?.authorId,
    authorIds: [],
    actorId: user.id,
    actorName: displayNameForUser(user),
    contentTitle: concept.title,
    href: `/concepts/${conceptSlug}/talk#post-${post.id}`
  });
  revalidatePath(`/concepts/${conceptSlug}/talk`);
  revalidatePath(`/concepts/${conceptSlug}`);
}

export async function updateConceptTalkPostAction(postId: number, conceptSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept-talk:update:${user.id}`, 30, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Message");
  const post = await prisma.conceptTalkPost.findFirst({
    where: { id: postId, deletedAt: null, concept: { slug: conceptSlug } },
    select: { id: true, authorId: true }
  });
  if (!post) throw new Error("Message not found.");
  if (!canEditConceptTalkPost(user, post)) {
    throw new Error("You cannot edit this message.");
  }

  const { renderMarkdown } = await import("@/lib/markdown");
  await prisma.conceptTalkPost.update({
    where: { id: post.id },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdown(bodyMarkdown),
      editedAt: new Date()
    }
  });

  revalidatePath(`/concepts/${conceptSlug}/talk`);
  revalidatePath(`/concepts/${conceptSlug}`);
}

export async function deleteConceptTalkPostAction(postId: number, conceptSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`concept-talk:delete:${user.id}`, 30, 60_000);
  const post = await prisma.conceptTalkPost.findFirst({
    where: { id: postId, deletedAt: null, concept: { slug: conceptSlug } },
    select: { id: true, authorId: true }
  });
  if (!post) throw new Error("Message not found.");
  if (!canEditConceptTalkPost(user, post)) {
    throw new Error("You cannot delete this message.");
  }

  await prisma.conceptTalkPost.update({
    where: { id: post.id },
    data: { deletedAt: new Date() }
  });

  revalidatePath(`/concepts/${conceptSlug}/talk`);
  revalidatePath(`/concepts/${conceptSlug}`);
}
