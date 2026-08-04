import { ContributionRequestStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dailyReminderWindow } from "@/lib/daily-reminder-window";
import { createNotification } from "@/lib/notifications";

export async function sendContributionRequestReminders(now = new Date()) {
  const requests = await prisma.contributionRequest.findMany({
    where: {
      status: ContributionRequestStatus.CLAIMED,
      claimedById: { not: null }
    },
    select: {
      id: true,
      body: true,
      kind: true,
      claimedById: true
    },
    orderBy: { createdAt: "asc" }
  });
  const requestsByUserId = new Map<number, typeof requests>();

  for (const request of requests) {
    if (!request.claimedById) continue;
    const current = requestsByUserId.get(request.claimedById) ?? [];
    current.push(request);
    requestsByUserId.set(request.claimedById, current);
  }

  const { start, end } = dailyReminderWindow(now);
  let created = 0;

  for (const [userId, userRequests] of requestsByUserId) {
    const existingReminder = await prisma.notification.findFirst({
      where: {
        userId,
        type: NotificationType.CONTRIBUTION_REQUEST_REMINDER,
        createdAt: {
          gte: start,
          lt: end
        }
      },
      select: { id: true }
    });
    if (existingReminder) continue;

    const count = userRequests.length;
    const firstRequest = userRequests[0];
    const shortBody = firstRequest.body.length > 120 ? `${firstRequest.body.slice(0, 117).trimEnd()}...` : firstRequest.body;
    const notification = await createNotification({
      userId,
      type: NotificationType.CONTRIBUTION_REQUEST_REMINDER,
      title: count === 1 ? "Contribution request reminder" : "Contribution requests reminder",
      body:
        count === 1
          ? `You have one request in progress: "${shortBody}"`
          : `You have ${count} requests in progress, including: "${shortBody}"`,
      href: "/contributing#requests"
    });

    if (notification) created += 1;
  }

  return {
    ok: true,
    assignedUsers: requestsByUserId.size,
    created
  };
}
