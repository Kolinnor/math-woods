import { NotificationType, Prisma, Role, SourceType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  DAILY_CONCEPT_REVIEW_STATUSES,
  dailyConceptReviewStatusRank,
  isDailyConceptReviewStatus,
  pickStaleConceptCandidate
} from "@/lib/daily-concept-review-selection";
import { dailyReminderWindow } from "@/lib/daily-reminder-window";

const DAILY_REVIEW_ROLES = [Role.MODERATOR, Role.ADMIN, Role.OWNER];

type ReviewTransaction = Prisma.TransactionClient;

function notificationContent(concept: { slug: string; title: string }) {
  return {
    type: NotificationType.DAILY_CONCEPT_REVIEW,
    title: "Daily concept review",
    body: `You can help improve Math Woods by reviewing "${concept.title}".`,
    href: `/concepts/${concept.slug}`
  } as const;
}

async function notificationsEnabled(tx: ReviewTransaction, userId: number) {
  const preference = await tx.notificationPreference.findUnique({
    where: {
      userId_type: {
        userId,
        type: NotificationType.DAILY_CONCEPT_REVIEW
      }
    },
    select: { enabled: true }
  });

  return preference?.enabled !== false;
}

export async function completeDailyConceptReviewForUser(
  tx: ReviewTransaction,
  userId: number,
  conceptId: number,
  completedAt = new Date()
) {
  const assignments = await tx.dailyConceptReview.findMany({
    where: { userId, conceptId, completedAt: null },
    select: { id: true, notificationId: true }
  });
  if (assignments.length === 0) return 0;

  await tx.dailyConceptReview.updateMany({
    where: { id: { in: assignments.map((assignment) => assignment.id) } },
    data: { completedAt }
  });
  const notificationIds = assignments.flatMap((assignment) =>
    assignment.notificationId === null ? [] : [assignment.notificationId]
  );
  if (notificationIds.length > 0) {
    await tx.notification.updateMany({
      where: { id: { in: notificationIds }, readAt: null },
      data: { readAt: completedAt }
    });
  }

  return assignments.length;
}

async function restoreMissingNotification(assignment: {
  id: number;
  userId: number;
  notificationId: number | null;
  concept: { slug: string; title: string };
}) {
  if (assignment.notificationId !== null) return false;

  return prisma.$transaction(async (tx) => {
    const current = await tx.dailyConceptReview.findUnique({
      where: { id: assignment.id },
      select: { completedAt: true, notificationId: true }
    });
    if (!current || current.completedAt || current.notificationId !== null) return false;
    if (!(await notificationsEnabled(tx, assignment.userId))) return false;

    const notification = await tx.notification.create({
      data: {
        userId: assignment.userId,
        ...notificationContent(assignment.concept)
      }
    });
    await tx.dailyConceptReview.update({
      where: { id: assignment.id },
      data: { notificationId: notification.id }
    });
    return true;
  });
}

async function reconcileOutstandingReview(userId: number, now: Date) {
  const assignment = await prisma.dailyConceptReview.findFirst({
    where: { userId, completedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      conceptId: true,
      notificationId: true,
      assignedStatus: true,
      createdAt: true,
      concept: { select: { slug: true, title: true, status: true } }
    }
  });
  if (!assignment) return { outstanding: false, restored: false };

  const editedByRecipient = await prisma.pageRevision.findFirst({
    where: {
      pageType: SourceType.CONCEPT,
      pageId: assignment.conceptId,
      editedById: userId,
      createdAt: { gte: assignment.createdAt }
    },
    select: { id: true }
  });
  const assignedRank = dailyConceptReviewStatusRank(assignment.assignedStatus);
  const currentRank = dailyConceptReviewStatusRank(assignment.concept.status);
  const statusImproved = currentRank > assignedRank;
  const noLongerNeedsReview = !isDailyConceptReviewStatus(assignment.concept.status);

  if (editedByRecipient || statusImproved || noLongerNeedsReview) {
    await prisma.$transaction((tx) => completeDailyConceptReviewForUser(tx, userId, assignment.conceptId, now));
    return { outstanding: false, restored: false };
  }

  const restored = await restoreMissingNotification(assignment);
  return { outstanding: true, restored };
}

async function candidateForUser(userId: number, random: () => number) {
  for (const status of DAILY_CONCEPT_REVIEW_STATUSES) {
    const candidates = await prisma.concept.findMany({
      where: {
        status,
        OR: [{ createdById: null }, { createdById: { not: userId } }]
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: 12,
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        updatedAt: true
      }
    });
    const candidate = pickStaleConceptCandidate(candidates, random);
    if (candidate) return candidate;
  }

  return null;
}

export async function sendDailyConceptReviews(now = new Date(), random: () => number = Math.random) {
  const recipients = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: { in: DAILY_REVIEW_ROLES }
    },
    select: { id: true }
  });
  const { start, end } = dailyReminderWindow(now);
  let created = 0;
  let outstanding = 0;
  let restored = 0;

  for (const recipient of recipients) {
    const reconciliation = await reconcileOutstandingReview(recipient.id, now);
    if (reconciliation.restored) restored += 1;
    if (reconciliation.outstanding) {
      outstanding += 1;
      continue;
    }

    const alreadyAssignedToday = await prisma.dailyConceptReview.findFirst({
      where: {
        userId: recipient.id,
        createdAt: { gte: start, lt: end }
      },
      select: { id: true }
    });
    if (alreadyAssignedToday) continue;

    const candidate = await candidateForUser(recipient.id, random);
    if (!candidate) continue;

    try {
      const wasCreated = await prisma.$transaction(async (tx) => {
        const [activeAssignment, preference] = await Promise.all([
          tx.dailyConceptReview.findFirst({
            where: { userId: recipient.id, completedAt: null },
            select: { id: true }
          }),
          notificationsEnabled(tx, recipient.id)
        ]);
        if (activeAssignment || !preference) return false;

        const notification = await tx.notification.create({
          data: {
            userId: recipient.id,
            ...notificationContent(candidate)
          }
        });
        await tx.dailyConceptReview.create({
          data: {
            userId: recipient.id,
            conceptId: candidate.id,
            notificationId: notification.id,
            assignedStatus: candidate.status
          }
        });
        return true;
      });
      if (wasCreated) created += 1;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }

  if (created > 0 || restored > 0) revalidatePath("/", "layout");

  return {
    eligibleUsers: recipients.length,
    created,
    outstanding,
    restored
  };
}
