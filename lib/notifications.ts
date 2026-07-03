import { NotificationType, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { problemEditNotificationRecipientIds } from "@/lib/problem-edit-notifications";

const OWNER_NOTIFICATION_USERNAME = "ancient-tree";

type NotificationInput = {
  userId: number;
  actorId?: number | null;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
};

type OwnerActivityNotificationType =
  | typeof NotificationType.USER_REGISTERED
  | typeof NotificationType.PROBLEM_CREATED
  | typeof NotificationType.CONCEPT_CREATED
  | typeof NotificationType.CONCEPT_EDITED;

type OwnerActivityNotificationInput = {
  actor: {
    id: number;
  };
  type: OwnerActivityNotificationType;
  title: string;
  body: string;
  href: string;
};

export async function createNotification(input: NotificationInput) {
  if (input.actorId && input.actorId === input.userId) return null;

  const preference = await prisma.notificationPreference.findUnique({
    where: {
      userId_type: {
        userId: input.userId,
        type: input.type
      }
    },
    select: { enabled: true }
  });

  if (preference?.enabled === false) return null;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      actorId: input.actorId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href
    }
  });

  revalidatePath("/", "layout");
  return notification;
}

export async function notifyProblemAuthor({
  problemId,
  actorId,
  type,
  title,
  body,
  href
}: {
  problemId: number;
  actorId: number;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
}) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true }
  });

  if (!problem) return null;

  return createNotification({
    userId: problem.authorId,
    actorId,
    type,
    title,
    body,
    href
  });
}

export async function notifyProblemEditSubscribers({
  problemId,
  actorId,
  title,
  body,
  href
}: {
  problemId: number;
  actorId: number;
  title: string;
  body: string;
  href: string;
}) {
  const [problem, participants] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: problemId },
      select: { authorId: true }
    }),
    prisma.discussionPost.findMany({
      where: {
        deletedAt: null,
        thread: { problemId }
      },
      distinct: ["authorId"],
      select: { authorId: true }
    })
  ]);

  if (!problem) return [];

  const recipientIds = problemEditNotificationRecipientIds({
    authorId: problem.authorId,
    participantIds: participants.map((participant) => participant.authorId),
    actorId
  });

  return Promise.all(
    recipientIds.map((userId) =>
      createNotification({
        userId,
        actorId,
        type: NotificationType.PROBLEM_EDITED,
        title,
        body,
        href
      })
    )
  );
}

export async function notifyOwnerOfSiteActivity(input: OwnerActivityNotificationInput) {
  const owner = await prisma.user.findFirst({
    where: {
      username: OWNER_NOTIFICATION_USERNAME,
      role: Role.OWNER
    },
    select: { id: true }
  });

  if (!owner) return null;

  return createNotification({
    userId: owner.id,
    actorId: input.actor.id,
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href
  });
}
