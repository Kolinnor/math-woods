"use server";

import {
  ProblemDifficultyReaction,
  ProblemPreferenceReaction,
  RecommendationEventType
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";
import { recordRecommendationOutcomeIfRelevant } from "@/lib/recommendation-events";
import { recalculateProblemDifficulty } from "@/lib/problem-difficulty-votes";
import { acquireTransactionLock } from "@/lib/transaction-lock";

export async function setProblemReactionAction(
  problemId: number,
  problemSlug: string,
  kind: "difficulty" | "preference",
  value: string
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem-reaction:${user.id}`, 40, 60_000);

  const existing = await prisma.problemReaction.findUnique({
    where: { userId_problemId: { userId: user.id, problemId } }
  });
  const data =
    kind === "difficulty"
      ? {
          difficultyReaction: Object.values(ProblemDifficultyReaction).includes(value as ProblemDifficultyReaction)
            ? existing?.difficultyReaction === value
              ? null
              : (value as ProblemDifficultyReaction)
            : null
        }
      : {
          preferenceReaction: Object.values(ProblemPreferenceReaction).includes(value as ProblemPreferenceReaction)
            ? existing?.preferenceReaction === value
              ? null
              : (value as ProblemPreferenceReaction)
            : null
        };

  await prisma.problemReaction.upsert({
    where: { userId_problemId: { userId: user.id, problemId } },
    create: { userId: user.id, problemId, ...data },
    update: data
  });
  if (
    kind === "difficulty" &&
    existing?.difficultyReaction !== value &&
    (value === ProblemDifficultyReaction.TOO_HARD || value === ProblemDifficultyReaction.TOO_EASY)
  ) {
    const problem = await prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, translationGroupId: true }
    });
    if (problem) {
      await recordRecommendationOutcomeIfRelevant({
        userId: user.id,
        eventType: value === ProblemDifficultyReaction.TOO_HARD
          ? RecommendationEventType.TOO_HARD
          : RecommendationEventType.TOO_EASY,
        problem
      });
    }
  }
  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath("/problems");
  revalidatePath("/");
}

export async function setProblemDifficultyVoteAction(
  problemId: number,
  problemSlug: string,
  formData: FormData
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem-difficulty-vote:${user.id}`, 20, 60_000);
  const value = Number(formData.get("difficulty"));
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("Difficulty must be an integer from 1 to 100.");
  }

  const translationSlugs = await prisma.$transaction(async (tx) => {
    const problem = await tx.problem.findUnique({
      where: { id: problemId },
      select: { id: true, slug: true, translationGroupId: true }
    });
    if (!problem || problem.slug !== problemSlug) throw new Error("Problem not found.");
    await acquireTransactionLock(tx, `problem-difficulty:${problem.translationGroupId}`);
    const solved = await tx.problemAttempt.findFirst({
      where: {
        userId: user.id,
        status: "SOLVED",
        problem: { translationGroupId: problem.translationGroupId }
      },
      select: { id: true }
    });
    if (!solved) throw new Error("Solve this problem before rating its difficulty.");

    await tx.problemDifficultyVote.upsert({
      where: {
        userId_translationGroupId: {
          userId: user.id,
          translationGroupId: problem.translationGroupId
        }
      },
      create: {
        userId: user.id,
        translationGroupId: problem.translationGroupId,
        value
      },
      update: { value }
    });
    await recalculateProblemDifficulty(tx, problem.translationGroupId);
    return tx.problem.findMany({
      where: { translationGroupId: problem.translationGroupId },
      select: { slug: true }
    });
  });

  for (const translation of translationSlugs) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/problems");
  revalidatePath("/");
}
