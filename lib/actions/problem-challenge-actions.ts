"use server";

import { FriendshipStatus, NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { directChatPair } from "@/lib/direct-chat";
import { renderMarkdown } from "@/lib/markdown";
import { createNotification } from "@/lib/notifications";
import {
  normalizeProblemChallengeMessage,
  problemDeliveryChatMarkdown,
  problemChallengeNotificationBody,
  problemShareNotificationBody,
  type ProblemDeliveryIntent,
  type ProblemChallengeError
} from "@/lib/problem-challenges";
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";
import { publicProfileLookupWhere } from "@/lib/usernames";

export type ProblemChallengeActionState = {
  error: ProblemChallengeError | null;
  ok: boolean;
};

export async function createProblemChallengeAction(
  fixedRecipientProfileSlug: string | null,
  intent: ProblemDeliveryIntent,
  _state: ProblemChallengeActionState,
  formData: FormData
): Promise<ProblemChallengeActionState> {
  const challenger = await requireVerifiedUser();
  try {
    await assertRateLimit(`problem-${intent}:${challenger.id}`, intent === "share" ? 20 : 10, 60_000);
  } catch {
    return { error: "rateLimited", ok: false };
  }

  const problemSlug = String(formData.get("problemSlug") ?? "").trim();
  const recipientProfileSlug =
    fixedRecipientProfileSlug ?? String(formData.get("recipientProfileSlug") ?? "").trim();
  const message = normalizeProblemChallengeMessage(formData.get("message"));
  if (!problemSlug) return { error: "chooseProblem", ok: false };
  if (!recipientProfileSlug) return { error: "chooseUser", ok: false };

  const [recipient, problem] = await Promise.all([
    prisma.user.findFirst({
      where: publicProfileLookupWhere(recipientProfileSlug),
      select: { id: true, username: true, profileSlug: true, displayName: true, deletedAt: true }
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

  const recentDuplicate = intent === "challenge"
    ? await prisma.problemChallenge.findFirst({
        where: {
          challengerId: challenger.id,
          recipientId: recipient.id,
          problemId: problem.id,
          createdAt: { gte: new Date(Date.now() - 5 * 60_000) }
        },
        select: { id: true }
      })
    : await prisma.notification.findFirst({
        where: {
          actorId: challenger.id,
          userId: recipient.id,
          type: NotificationType.PROBLEM_SHARED,
          href: `/problems/${problem.slug}`,
          createdAt: { gte: new Date(Date.now() - 5 * 60_000) }
        },
        select: { id: true }
      });
  if (recentDuplicate) return { error: "duplicate", ok: false };

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [
        { requesterId: challenger.id, addresseeId: recipient.id },
        { requesterId: recipient.id, addresseeId: challenger.id }
      ]
    },
    select: { id: true }
  });
  const chatBodyMarkdown = friendship
    ? problemDeliveryChatMarkdown({
        intent,
        problemTitle: problem.title,
        problemSlug: problem.slug,
        message
      })
    : null;
  const chatBodyHtml = chatBodyMarkdown ? await renderMarkdown(chatBodyMarkdown) : null;

  await prisma.$transaction(async (tx) => {
    if (intent === "challenge") {
      await tx.problemChallenge.create({
        data: {
          challengerId: challenger.id,
          recipientId: recipient.id,
          problemId: problem.id,
          message: message || null
        }
      });
    }

    if (chatBodyMarkdown && chatBodyHtml) {
      const pair = directChatPair(challenger.id, recipient.id);
      const chat = await tx.directChat.upsert({
        where: { userAId_userBId: pair },
        update: { updatedAt: new Date() },
        create: pair
      });
      await tx.chatMessage.create({
        data: {
          directChatId: chat.id,
          authorId: challenger.id,
          bodyMarkdown: chatBodyMarkdown,
          bodyHtml: chatBodyHtml
        }
      });
    }
  });

  await createNotification({
    userId: recipient.id,
    actorId: challenger.id,
    type: intent === "challenge" ? NotificationType.PROBLEM_CHALLENGE : NotificationType.PROBLEM_SHARED,
    title: intent === "challenge" ? "New challenge" : "A problem was shared with you",
    body: intent === "challenge"
      ? problemChallengeNotificationBody({
          challengerName: displayNameForUser(challenger),
          problemTitle: problem.title,
          message
        })
      : problemShareNotificationBody({
          senderName: displayNameForUser(challenger),
          problemTitle: problem.title,
          message
        }),
    href: `/problems/${problem.slug}`
  });

  revalidatePath("/", "layout");
  revalidatePath("/friends");
  revalidatePath(`/chat/${recipient.username}`);
  revalidatePath(`/chat/${challenger.username}`);
  revalidatePath(`/profile/${recipient.profileSlug}`);
  return { error: null, ok: true };
}
