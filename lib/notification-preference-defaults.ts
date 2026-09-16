import { NotificationType, Role } from "@prisma/client";

export function notificationPreferenceDefault(type: NotificationType, role: Role) {
  if (type === NotificationType.USER_REGISTERED || type === NotificationType.SITE_IMPROVEMENT_REMINDER) return role === Role.OWNER;
  return true;
}
