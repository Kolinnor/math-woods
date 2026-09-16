import { NotificationType, Role, SiteImprovementStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { siteImprovementReminderCopy, siteImprovementReminderDate, SITE_IMPROVEMENT_REMINDER_HREF } from "@/lib/site-improvement-reminder-copy";

export async function sendSiteImprovementReminder(now = new Date()) {
  const dateKey = siteImprovementReminderDate(now);
  if (!dateKey) return { created: 0 };
  const owner = await prisma.user.findFirst({
    where: {
      username: { equals: "ancient-tree", mode: "insensitive" },
      role: Role.OWNER,
      deletedAt: null,
      notificationPreferences: { none: { type: NotificationType.SITE_IMPROVEMENT_REMINDER, enabled: false } }
    },
    select: { id: true }
  });
  if (!owner) return { created: 0 };

  const remaining = await prisma.siteImprovement.count({ where: { status: { not: SiteImprovementStatus.COMPLETED } } });
  const result = await prisma.notification.createMany({
    data: [{
      userId: owner.id,
      type: NotificationType.SITE_IMPROVEMENT_REMINDER,
      aggregationKey: `site-improvements:${dateKey}`,
      ...siteImprovementReminderCopy(remaining, "en"),
      href: SITE_IMPROVEMENT_REMINDER_HREF
    }],
    // The database's unique (userId, type, aggregationKey) also prevents concurrent duplicates.
    skipDuplicates: true
  });
  if (result.count) revalidatePath("/", "layout");
  return { created: result.count, remaining };
}
