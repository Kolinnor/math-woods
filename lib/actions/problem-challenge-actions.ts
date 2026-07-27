"use server";

import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import {
  normalizeProblemChallengeMessage,
  problemChallengeNotificationBody,
  type ProblemChallengeError
} from "@/lib/problem-challenges";
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";

export type ProblemChallengeActionState = {
  error: ProblemChallengeError | null;
  ok: boolean;
};

export async function createProblemChallengeAction(
  recipientUsername: string,
  _state: ProblemChallengeActionState,
  formData: FormData
): Promise<ProblemChallengeActionState> {
  const challenger = await requireVerifiedUser();
  try {
    await assertRateLimit(`problem-challenge:${challenger.id}`, 10, 60_000);
  } catch {
    return { error: "rateLimited", ok: false };
  }

  const problemSlug = String(formData.get("problemSlug") ?? "").trim();
  const message = normalizeProblemChallengeMessage(formData.get("message"));
  if (!problemSlug) return { error: "chooseProblem", ok: false };

  const [recipient, problem] = await Promise.all([
    prisma.user.findUnique({
      where: { username: recipientUsername },
      select: { id: true, username: true, displayName: true, deletedAt: true }
    }),
    prisma.problem.findFirst({
      where: {
        slug: problemSlug,
        listed: true,
        status: "PUBLISHED"
      },
      select: { id: true, slug: true, title: true }
    })
  ]);

  if (!recipient || recipient.deletedAt) return { error: "userUnavailable", ok: false };
  if (recipient.id === challenger.id) return { error: "selfChallenge", ok: false };
  if (!problem) return { error: "problemUnavailable", ok: false };

  const recentDuplicate = await prisma.problemChallenge.findFirst({
    where: {
      challengerId: challenger.id,
      recipientId: recipient.id,
      problemId: problem.id,
      createdAt: { gte: new Date(Date.now() - 5 * 60_000) }
    },
    select: { id: true }
  });
  if (recentDuplicate) return { error: "duplicate", ok: false };

  await prisma.problemChallenge.create({
    data: {
      challengerId: challenger.id,
      recipientId: recipient.id,
      problemId: problem.id,
      message: message || null
    }
  });

  await createNotification({
    userId: recipient.id,
    actorId: challenger.id,
    type: NotificationType.PROBLEM_CHALLENGE,
    title: "New challenge",
    body: problemChallengeNotificationBody({
      challengerName: displayNameForUser(challenger),
      problemTitle: problem.title,
      message
    }),
    href: `/problems/${problem.slug}`
  });

  revalidatePath("/", "layout");
  revalidatePath(`/profile/${recipient.username}`);
  return { error: null, ok: true };
}
