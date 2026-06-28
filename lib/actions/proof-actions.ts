"use server";

import { NotificationType, TargetType, VoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkProofAchievements } from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { notifyProblemAuthor } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { canModerate } from "@/lib/roles";
import { displayNameForUser } from "@/lib/user-display";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createProofAction(problemId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof:${user.id}`, 6, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Solution");

  await prisma.problemProof.create({
    data: {
      problemId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  await checkProofAchievements(user.id);
  await notifyProblemAuthor({
    problemId,
    actorId: user.id,
    type: NotificationType.PROOF_ADDED,
    title: "New solution on your problem",
    body: `${displayNameForUser(user)} added a solution.`,
    href: `/problems/${problemSlug}`
  });
}

export async function updateProofAction(proofId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof:update:${user.id}`, 20, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Solution");

  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: { authorId: true, problem: { select: { slug: true } } }
  });
  if (!proof || proof.problem.slug !== problemSlug) {
    throw new Error("Solution not found.");
  }
  if (proof.authorId !== user.id && !canModerate(user.role)) {
    throw new Error("You cannot edit this solution.");
  }

  await prisma.problemProof.update({
    where: { id: proofId },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  redirect(`/problems/${problemSlug}`);
}

export async function deleteProofAction(proofId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof:delete:${user.id}`, 10, 60_000);

  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: { authorId: true, problem: { select: { slug: true } } }
  });
  if (!proof || proof.problem.slug !== problemSlug) {
    throw new Error("Solution not found.");
  }
  if (proof.authorId !== user.id && !canModerate(user.role)) {
    throw new Error("You cannot delete this solution.");
  }

  await prisma.$transaction([
    prisma.vote.deleteMany({ where: { targetType: TargetType.PROOF, targetId: proofId } }),
    prisma.problemProof.delete({ where: { id: proofId } })
  ]);

  revalidatePath(`/problems/${problemSlug}`);
  redirect(`/problems/${problemSlug}`);
}

export async function voteProofAction(proofId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);
  const key = {
    userId: user.id,
    targetType: TargetType.PROOF,
    targetId: proofId
  };
  const existing = await prisma.vote.findUnique({
    where: { userId_targetType_targetId: key }
  });

  if (existing) {
    await prisma.vote.delete({ where: { userId_targetType_targetId: key } });
  } else {
    await prisma.vote.create({ data: { ...key, voteType: VoteType.UP } });
  }

  revalidatePath(`/problems/${problemSlug}`);
}

export async function createProofCommentAction(proofId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof-comment:${user.id}`, 12, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Comment");

  await prisma.proofComment.create({
    data: {
      proofId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
}
