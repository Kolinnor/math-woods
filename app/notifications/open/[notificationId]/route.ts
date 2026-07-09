import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markNotificationRead, safeNotificationHref } from "@/lib/notification-lifecycle";

export async function GET(_request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const user = await requireUser();
  const { notificationId } = await params;
  const id = Number.parseInt(notificationId, 10);

  if (!Number.isInteger(id)) redirect("/notifications");

  const notification = await prisma.notification.findFirst({
    where: { id, userId: user.id },
    select: { id: true, href: true }
  });

  if (!notification) redirect("/notifications");

  await markNotificationRead(user.id, notification.id);
  redirect(safeNotificationHref(notification.href) as never);
}
