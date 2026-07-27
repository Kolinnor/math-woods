"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser, requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  normalizeProblemChallengeInviteToken,
  PROBLEM_CHALLENGE_INVITE_MAX_AGE_MS,
  problemChallengeInvitePath,
  problemChallengeInviteTokenHash,
  type ProblemChallengeInviteError
} from "@/lib/problem-challenge-invites";
import { normalizeProblemChallengeMessage } from "@/lib/problem-challenges";
import { assertRateLimit } from "@/lib/rate-limit";

export type ProblemChallengeInviteActionState = {
  error: ProblemChallengeInviteError | null;
  linkPath: string | null;
};

export async function createProblemChallengeInviteAction(
  problemSlug: string,
  _state: ProblemChallengeInviteActionState,
  formData: FormData
): Promise<ProblemChallengeInviteActionState> {
  const challenger = await requireVerifiedUser();
  try {
    await assertRateLimit(`problem-challenge-invite:${challenger.id}`, 20, 60 * 60_000);
  } catch {
    return { error: "rateLimited", linkPath: null };
  }

  const problem = await prisma.problem.findFirst({
    where: {
      slug: problemSlug,
      listed: true,
      status: "PUBLISHED"
    },
    select: { id: true }
  });
  if (!problem) return { error: "problemUnavailable", linkPath: null };

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const message = normalizeProblemChallengeMessage(formData.get("message"));

  await prisma.$transaction([
    prisma.problemChallengeInvite.deleteMany({
      where: {
        acceptedAt: null,
        expiresAt: { lte: now }
      }
    }),
    prisma.problemChallengeInvite.create({
      data: {
        tokenHash: problemChallengeInviteTokenHash(token),
        challengerId: challenger.id,
        problemId: problem.id,
        message: message || null,
        expiresAt: new Date(now.getTime() + PROBLEM_CHALLENGE_INVITE_MAX_AGE_MS)
      }
    })
  ]);

  return {
    error: null,
    linkPath: problemChallengeInvitePath(token)
  };
}

export async function acceptProblemChallengeInviteAction(tokenValue: string) {
  const user = await requireUser();
  await assertRateLimit(`problem-challenge-invite-accept:${user.id}`, 10, 60_000);

  const token = normalizeProblemChallengeInviteToken(tokenValue);
  if (!token) redirect("/challenge/unavailable");

  const tokenHash = problemChallengeInviteTokenHash(token);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const invite = await tx.problemChallengeInvite.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        challengerId: true,
        problemId: true,
        message: true,
        expiresAt: true,
        acceptedById: true,
        problem: {
          select: {
            slug: true,
            listed: true,
            status: true
          }
        }
      }
    });

    if (!invite || invite.expiresAt <= now || !invite.problem.listed || invite.problem.status !== "PUBLISHED") {
      return { status: "unavailable" as const };
    }
    if (invite.challengerId === user.id) {
      return { status: "self" as const, slug: invite.problem.slug };
    }
    if (invite.acceptedById) {
      return invite.acceptedById === user.id
        ? { status: "accepted" as const, slug: invite.problem.slug }
        : { status: "claimed" as const };
    }

    const claimed = await tx.problemChallengeInvite.updateMany({
      where: {
        id: invite.id,
        acceptedById: null,
        acceptedAt: null,
        expiresAt: { gt: now }
      },
      data: {
        acceptedById: user.id,
        acceptedAt: now
      }
    });
    if (claimed.count !== 1) return { status: "claimed" as const };

    await tx.problemChallenge.create({
      data: {
        challengerId: invite.challengerId,
        recipientId: user.id,
        problemId: invite.problemId,
        message: invite.message
      }
    });

    return { status: "accepted" as const, slug: invite.problem.slug };
  });

  if (result.status === "accepted") {
    redirect(`/problems/${result.slug}?challenge=accepted` as never);
  }
  if (result.status === "self") {
    redirect(`/challenge/${encodeURIComponent(token)}?status=self` as never);
  }
  redirect(`/challenge/${encodeURIComponent(token)}?status=${result.status}` as never);
}
