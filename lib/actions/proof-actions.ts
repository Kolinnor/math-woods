"use server";

import { TargetType, VoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PROBLEM_SCORE_REPUTATION, PROBLEM_SCORE_SOLVED_COUNT } from "@/lib/problems";
import { assertRateLimit } from "@/lib/rate-limit";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createProofAction(problemId: number, problemSlug: string, formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`proof:${user.id}`, 6, 60_000);
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  if (!bodyMarkdown) throw new Error("Proof cannot be empty.");

  await prisma.problemProof.create({
    data: {
      problemId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
}

export async function voteProofAction(proofId: number, problemSlug: string) {
  const user = await requireUser();

  await prisma.vote.upsert({
    where: {
      userId_targetType_targetId: {
        userId: user.id,
        targetType: TargetType.PROOF,
        targetId: proofId
      }
    },
    update: { voteType: VoteType.UP },
    create: {
      userId: user.id,
      targetType: TargetType.PROOF,
      targetId: proofId,
      voteType: VoteType.UP
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
}

export async function createProofCommentAction(proofId: number, problemSlug: string, formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`proof-comment:${user.id}`, 12, 60_000);
  const bodyMarkdown = String(formData.get("bodyMarkdown") ?? "").trim();
  if (!bodyMarkdown) throw new Error("Comment cannot be empty.");

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

export async function scoreProblemAction(problemId: number, problemSlug: string, formData: FormData) {
  const user = await requireUser();
  const naturality = Number(formData.get("naturality"));
  if (!Number.isInteger(naturality) || naturality < 1 || naturality > 100) {
    throw new Error("Score must be between 1 and 100.");
  }

  const [solved, solvedCount] = await Promise.all([
    prisma.problemAttempt.findUnique({
      where: { userId_problemId: { userId: user.id, problemId } },
      select: { status: true }
    }),
    prisma.problemAttempt.count({ where: { userId: user.id, status: "SOLVED" } })
  ]);
  const experienced =
    user.reputation >= PROBLEM_SCORE_REPUTATION ||
    solvedCount >= PROBLEM_SCORE_SOLVED_COUNT ||
    user.role === "MODERATOR" ||
    user.role === "ADMIN";
  if (solved?.status !== "SOLVED" || !experienced) {
    throw new Error("Only experienced users who solved the problem may score it.");
  }

  await prisma.problemScore.upsert({
    where: { userId_problemId: { userId: user.id, problemId } },
    update: { naturality },
    create: { userId: user.id, problemId, naturality }
  });

  revalidatePath(`/problems/${problemSlug}`);
}
