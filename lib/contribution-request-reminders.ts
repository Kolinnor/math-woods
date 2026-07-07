import { ContributionRequestStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

const REMINDER_TIME_ZONE = "Europe/Paris";

function timeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second")
  };
}

function localTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const initialUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const rendered = timeZoneParts(new Date(initialUtc), timeZone);
  const renderedUtc = Date.UTC(
    rendered.year,
    rendered.month - 1,
    rendered.day,
    rendered.hour,
    rendered.minute,
    rendered.second
  );

  return new Date(initialUtc - (renderedUtc - initialUtc));
}

function addUtcDays(year: number, month: number, day: number, days: number) {
  const next = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate()
  };
}

function reminderDayWindow(now: Date) {
  const today = timeZoneParts(now, REMINDER_TIME_ZONE);
  const tomorrow = addUtcDays(today.year, today.month, today.day, 1);

  return {
    start: localTimeToUtc(today.year, today.month, today.day, 0, 0, REMINDER_TIME_ZONE),
    end: localTimeToUtc(tomorrow.year, tomorrow.month, tomorrow.day, 0, 0, REMINDER_TIME_ZONE)
  };
}

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

  const { start, end } = reminderDayWindow(now);
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
