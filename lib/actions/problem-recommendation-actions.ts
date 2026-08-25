"use server";

import { ProblemRecommendationDismissalReason } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

async function recommendationProblem(problemId: number) {
  if (!Number.isInteger(problemId) || problemId <= 0) throw new Error("Problem not found.");
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, slug: true, translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  return problem;
}

export async function dismissProblemRecommendationAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`recommendation-dismiss:${user.id}`, 30, 60_000);
  const problem = await recommendationProblem(problemId);
  const now = new Date();

  await prisma.problemRecommendationExposure.upsert({
    where: {
      userId_translationGroupId: {
        userId: user.id,
        translationGroupId: problem.translationGroupId
      }
    },
    create: {
      userId: user.id,
      problemId: problem.id,
      translationGroupId: problem.translationGroupId,
      exposureCount: 0,
      firstOpenedAt: now,
      lastOpenedAt: now,
      dismissedAt: now
    },
    update: {
      problemId: problem.id,
      dismissedAt: now,
      dismissalReason: null
    }
  });

  revalidatePath("/problems");
  revalidatePath("/");
}

export async function undoProblemRecommendationDismissalAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`recommendation-dismiss:${user.id}`, 30, 60_000);
  const problem = await recommendationProblem(problemId);

  await prisma.problemRecommendationExposure.updateMany({
    where: {
      userId: user.id,
      translationGroupId: problem.translationGroupId
    },
    data: { dismissedAt: null, dismissalReason: null }
  });

  revalidatePath("/problems");
  revalidatePath("/");
}

export async function setDismissedRecommendationReasonAction(
  problemId: number,
  reason: "TOO_HARD" | "TOO_EASY" | "LESS_LIKE_THIS" | "ALREADY_KNOWN" | "NOT_INTERESTED_IN_DOMAIN"
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`recommendation-reason:${user.id}`, 30, 60_000);
  const problem = await recommendationProblem(problemId);

  if (!Object.values(ProblemRecommendationDismissalReason).includes(reason)) {
    throw new Error("Invalid recommendation reason.");
  }
  const updated = await prisma.problemRecommendationExposure.updateMany({
    where: {
      userId: user.id,
      translationGroupId: problem.translationGroupId,
      dismissedAt: { not: null }
    },
    data: { dismissalReason: reason }
  });
  if (updated.count === 0) throw new Error("Dismissed recommendation not found.");

  revalidatePath("/problems");
  revalidatePath("/");
}
