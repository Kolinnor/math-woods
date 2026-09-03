import "server-only";

import { prisma } from "@/lib/db";

export const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export async function countOnlineUsers() {
  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const onlineSessions = await prisma.session.findMany({
    where: {
      lastSeenAt: { gte: onlineSince },
      expiresAt: { gt: now }
    },
    distinct: ["userId"],
    select: { userId: true }
  });
  return onlineSessions.length;
}
