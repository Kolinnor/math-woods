"use server";

import {
  ProblemDifficultyReaction,
  ProblemPreferenceReaction
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

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
  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath("/problems");
  revalidatePath("/");
}
