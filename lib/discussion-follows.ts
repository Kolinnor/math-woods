import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { discussionRecipientIds, discussionTargetWhere, isFollowingDiscussion, type DiscussionTarget } from "@/lib/discussion-follow-policy";

export async function getDiscussionFollowing(target: DiscussionTarget, userId: number, isAuthor: boolean) {
  const [preference, participation] = await Promise.all([
    prisma.discussionFollow.findFirst({
      where: { userId, ...discussionTargetWhere(target) },
      select: { following: true }
    }),
    // Soft-deleted messages still count as having participated. Posting again never resets an opt-out.
    target.kind === "problem"
      ? prisma.discussionPost.findFirst({ where: { authorId: userId, thread: { problemId: target.id } }, select: { id: true } })
      : target.kind === "proof"
        ? prisma.proofComment.findFirst({ where: { authorId: userId, proofId: target.id }, select: { id: true } })
        : prisma.conceptTalkPost.findFirst({ where: { authorId: userId, conceptId: target.id }, select: { id: true } })
  ]);
  return {
    following: isFollowingDiscussion(isAuthor || Boolean(participation), preference?.following),
    muted: preference?.following === false
  };
}

export async function notifyDiscussionFollowers(input: {
  target: DiscussionTarget;
  authorIds: number[];
  actorId: number;
  actorName: string;
  contentTitle: string;
  href: string;
}) {
  const { target } = input;
  const [participants, preferences] = await Promise.all([
    target.kind === "problem"
      ? prisma.discussionPost.findMany({ where: { thread: { problemId: target.id } }, distinct: ["authorId"], select: { authorId: true } })
      : target.kind === "proof"
        ? prisma.proofComment.findMany({ where: { proofId: target.id }, distinct: ["authorId"], select: { authorId: true } })
        : prisma.conceptTalkPost.findMany({ where: { conceptId: target.id }, distinct: ["authorId"], select: { authorId: true } }),
    prisma.discussionFollow.findMany({
      where: discussionTargetWhere(target),
      select: { userId: true, following: true }
    })
  ]);
  const recipientIds = discussionRecipientIds(
    [...input.authorIds, ...participants.map((participant) => participant.authorId)], preferences, input.actorId
  );
  await Promise.all(recipientIds.map((userId) => createNotification({
    userId,
    actorId: input.actorId,
    type: NotificationType.DISCUSSION_POSTED,
    title: target.kind === "proof" ? "New message in a solution discussion you follow"
      : target.kind === "concept" ? "New message in a concept discussion you follow" : "New discussion message",
    body: `${input.actorName} posted in the discussion of "${input.contentTitle}".`,
    href: input.href
  })));
}
