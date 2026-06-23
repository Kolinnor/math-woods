import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

type NotificationInput = {
  userId: number;
  actorId?: number | null;
  type: NotificationType;
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
