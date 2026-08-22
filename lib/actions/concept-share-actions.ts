"use server";

import { FriendshipStatus, NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireVerifiedUser } from "@/lib/auth";
import {
  conceptShareChatMarkdown,
  conceptShareNotificationBody,
  normalizeConceptShareMessage,
  type ConceptShareError
} from "@/lib/concept-shares";
import { prisma } from "@/lib/db";
import { directChatPair } from "@/lib/direct-chat";
import { renderMarkdown } from "@/lib/markdown";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";
import { publicProfileLookupWhere } from "@/lib/usernames";

export type ConceptShareActionState = {
  error: ConceptShareError | null;
  ok: boolean;
};

export async function createConceptShareAction(
  conceptSlug: string,
  _state: ConceptShareActionState,
  formData: FormData
): Promise<ConceptShareActionState> {
  const sender = await requireVerifiedUser();
  try {
    await assertRateLimit(`concept-share:${sender.id}`, 20, 60_000);
  } catch {
    return { error: "rateLimited", ok: false };
  }

  const recipientProfileSlug = String(formData.get("recipientProfileSlug") ?? "").trim();
  const message = normalizeConceptShareMessage(formData.get("message"));
  if (!recipientProfileSlug) return { error: "chooseUser", ok: false };

  const [recipient, concept] = await Promise.all([
    prisma.user.findFirst({
      where: publicProfileLookupWhere(recipientProfileSlug),
      select: { id: true, username: true, profileSlug: true, displayName: true, deletedAt: true }
    }),
    prisma.concept.findFirst({
      where: { slug: conceptSlug },
      select: { slug: true, title: true }
    })
  ]);

  if (!recipient || recipient.deletedAt) return { error: "userUnavailable", ok: false };
  if (recipient.id === sender.id) return { error: "selfShare", ok: false };
  if (!concept) return { error: "conceptUnavailable", ok: false };

  const href = `/concepts/${concept.slug}`;
  const recentDuplicate = await prisma.notification.findFirst({
    where: {
      actorId: sender.id,
      userId: recipient.id,
      type: NotificationType.CONCEPT_SHARED,
      href,
      createdAt: { gte: new Date(Date.now() - 5 * 60_000) }
    },
    select: { id: true }
  });
  if (recentDuplicate) return { error: "duplicate", ok: false };

  const friendship = await prisma.friendship.findFirst({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [
        { requesterId: sender.id, addresseeId: recipient.id },
        { requesterId: recipient.id, addresseeId: sender.id }
      ]
    },
    select: { id: true }
  });

  if (friendship) {
    const bodyMarkdown = conceptShareChatMarkdown({
      conceptTitle: concept.title,
      conceptSlug: concept.slug,
      message
    });
    const bodyHtml = await renderMarkdown(bodyMarkdown);
    const pair = directChatPair(sender.id, recipient.id);
    await prisma.$transaction(async (tx) => {
      const chat = await tx.directChat.upsert({
        where: { userAId_userBId: pair },
        update: { updatedAt: new Date() },
        create: pair
      });
      await tx.chatMessage.create({
        data: {
          directChatId: chat.id,
          authorId: sender.id,
          bodyMarkdown,
          bodyHtml
        }
      });
    });
  }

  await createNotification({
    userId: recipient.id,
    actorId: sender.id,
    type: NotificationType.CONCEPT_SHARED,
    title: "A concept was shared with you",
    body: conceptShareNotificationBody({
      senderName: displayNameForUser(sender),
      conceptTitle: concept.title,
      message
    }),
    href
  });

  revalidatePath("/", "layout");
  revalidatePath("/friends");
  revalidatePath(`/chat/${recipient.username}`);
  revalidatePath(`/chat/${sender.username}`);
  revalidatePath(`/profile/${recipient.profileSlug}`);
  return { error: null, ok: true };
}
