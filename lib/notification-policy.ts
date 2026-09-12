import { NotificationType } from "@prisma/client";

// Retired permanently. Keep the enum values readable for older database rows.
export const RETIRED_LIBRARY_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.LIBRARY_ENTRY_SUBMITTED,
  NotificationType.LIBRARY_ENTRY_PUBLISHED,
  NotificationType.LIBRARY_ENTRY_CHANGES_REQUESTED
];

export function isRetiredLibraryNotification(type: NotificationType) {
  return RETIRED_LIBRARY_NOTIFICATION_TYPES.includes(type);
}
