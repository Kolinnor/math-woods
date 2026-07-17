"use server";

import { FriendshipStatus, NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendDirectChatMessage } from "@/lib/direct-chat";
import { clearFriendRequestNotifications } from "@/lib/notification-lifecycle";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { displayNameForUser } from "@/lib/user-display";

async function friendshipBetween(userId: number, otherUserId: number) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: otherUserId },
        { requesterId: otherUserId, addresseeId: userId }
      ]
    }
  });
}

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

export async function sendFriendRequestAction(username: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`friend-request:${user.id}`, 20, 60_000);
  const target = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true, deletedAt: true }
  });

  if (!target || target.deletedAt) throw new Error("User not found.");
  if (target.id === user.id) throw new Error("You cannot add yourself as a friend.");

  const existing = await friendshipBetween(user.id, target.id);
  if (existing) {
    if (existing.status === FriendshipStatus.PENDING && existing.addresseeId === user.id) {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: FriendshipStatus.ACCEPTED }
      });
      await clearFriendRequestNotifications(user.id, target.id);
      revalidatePath("/friends");
      revalidatePath("/", "layout");
      revalidatePath(`/profile/${target.username}`);
      redirect(`/chat/${target.username}` as never);
    }

    revalidatePath("/friends");
    revalidatePath("/", "layout");
    revalidatePath(`/profile/${target.username}`);
    return;
  }

  await prisma.friendship.create({
    data: {
      requesterId: user.id,
      addresseeId: target.id
    }
  });

  await createNotification({
    userId: target.id,
    actorId: user.id,
    type: NotificationType.FRIEND_REQUEST,
    title: "New friend request",
    body: `${displayNameForUser(user)} sent you a friend request.`,
    href: "/friends"
  });

  revalidatePath("/friends");
  revalidatePath("/", "layout");
  revalidatePath(`/profile/${target.username}`);
}

export async function acceptFriendRequestAction(friendshipId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`friend-accept:${user.id}`, 40, 60_000);
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      addresseeId: user.id,
      status: FriendshipStatus.PENDING
    },
    include: { requester: { select: { id: true, username: true } } }
  });

  if (!friendship) throw new Error("Friend request not found.");

  await prisma.friendship.update({
    where: { id: friendship.id },
    data: { status: FriendshipStatus.ACCEPTED }
  });
  await clearFriendRequestNotifications(user.id, friendship.requesterId);

  await createNotification({
    userId: friendship.requesterId,
    actorId: user.id,
    type: NotificationType.FRIEND_REQUEST,
    title: "Friend request accepted",
    body: `${displayNameForUser(user)} accepted your friend request.`,
    href: `/chat/${user.username}`
  });

  revalidatePath("/friends");
  revalidatePath("/", "layout");
  revalidatePath(`/profile/${friendship.requester.username}`);
  redirect(`/chat/${friendship.requester.username}` as never);
}

export async function declineFriendRequestAction(friendshipId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`friend-decline:${user.id}`, 40, 60_000);

  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      addresseeId: user.id,
      status: FriendshipStatus.PENDING
    },
    select: { id: true, requesterId: true }
  });

  if (friendship) {
    await prisma.friendship.delete({ where: { id: friendship.id } });
    await clearFriendRequestNotifications(user.id, friendship.requesterId);
  }

  revalidatePath("/friends");
  revalidatePath("/", "layout");
}

export async function cancelFriendRequestAction(friendshipId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`friend-cancel:${user.id}`, 40, 60_000);

  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      requesterId: user.id,
      status: FriendshipStatus.PENDING
    },
    include: { addressee: { select: { id: true, username: true } } }
  });

  if (!friendship) throw new Error("Friend request not found.");

  await prisma.friendship.delete({
    where: { id: friendship.id }
  });
  await clearFriendRequestNotifications(friendship.addresseeId, user.id);

  revalidatePath("/friends");
  revalidatePath("/", "layout");
  revalidatePath(`/profile/${friendship.addressee.username}`);
}

export async function removeFriendAction(friendshipId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`friend-remove:${user.id}`, 20, 60_000);

  await prisma.friendship.deleteMany({
    where: {
      id: friendshipId,
      status: { in: [FriendshipStatus.ACCEPTED, FriendshipStatus.PENDING] },
      OR: [{ requesterId: user.id }, { addresseeId: user.id }]
    }
  });

  revalidatePath("/friends");
  revalidatePath("/", "layout");
  redirect("/friends" as never);
}

export async function sendFriendRequestByUsernameAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) throw new Error("Username is required.");
  await sendFriendRequestAction(username);
  redirect("/friends" as never);
}

export async function sendFriendRequestByUsernameFormAction(
  _state: { ok: boolean; message: string | null },
  formData: FormData
) {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { ok: false, message: "Enter a username." };

  try {
    await sendFriendRequestAction(username);
    return { ok: true, message: "Friend request sent." };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Could not send this friend request.";
    return { ok: false, message };
  }
}

export async function createChatMessageAction(otherUsername: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`chat-message:${user.id}`, 30, 60_000);
  await sendDirectChatMessage(user, otherUsername, formData.get("bodyMarkdown"));

  revalidatePath("/friends");
  revalidatePath(`/chat/${otherUsername}`);
  redirect(`/chat/${otherUsername}` as never);
}
