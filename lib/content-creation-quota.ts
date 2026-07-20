import { Role, SourceType, type Prisma } from "@prisma/client";
import { hasAdminPrivileges, hasTrustedPrivileges } from "./permissions.ts";

export const REGULAR_DAILY_CONTENT_CREATION_LIMIT = 20;
export const TRUSTED_DAILY_CONTENT_CREATION_LIMIT = 100;
export const CONTENT_CREATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function dailyContentCreationLimitForRole(role: Role) {
  if (hasAdminPrivileges(role)) return null;
  if (hasTrustedPrivileges(role)) return TRUSTED_DAILY_CONTENT_CREATION_LIMIT;
  return REGULAR_DAILY_CONTENT_CREATION_LIMIT;
}

export function contentCreationWindowStart(now: Date) {
  return new Date(now.getTime() - CONTENT_CREATION_WINDOW_MS);
}

export async function assertDailyContentCreationQuota(
  tx: Prisma.TransactionClient,
  user: { id: number; role: Role },
  now = new Date()
) {
  const limit = dailyContentCreationLimitForRole(user.role);
  if (limit === null) return;

  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`content-create:${user.id}`}))`;
  const creationCount = await tx.pageRevision.count({
    where: {
      editedById: user.id,
      isCreation: true,
      pageType: { in: [SourceType.PROBLEM, SourceType.CONCEPT] },
      createdAt: { gte: contentCreationWindowStart(now) }
    }
  });

  if (creationCount >= limit) {
    throw new Error(
      `Daily creation limit reached. You can create up to ${limit} problems and concepts combined in any 24-hour period.`
    );
  }
}
