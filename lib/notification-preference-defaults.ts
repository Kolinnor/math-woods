import { NotificationType, Role } from "@prisma/client";

export function notificationPreferenceDefault(type: NotificationType, role: Role) {
  if (type === NotificationType.USER_REGISTERED) return role === Role.OWNER;
  return true;
}
