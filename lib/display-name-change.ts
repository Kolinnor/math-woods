import { Role } from "@prisma/client";
import { hasOwnerPrivileges } from "./permissions.ts";

export const DISPLAY_NAME_CHANGE_COOLDOWN_DAYS = 90;
export const DISPLAY_NAME_CHANGE_COOLDOWN_MS = DISPLAY_NAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export function nextDisplayNameChangeAt(lastChangedAt: Date | null | undefined) {
  if (!lastChangedAt) return null;
  return new Date(lastChangedAt.getTime() + DISPLAY_NAME_CHANGE_COOLDOWN_MS);
}

export function canChangeDisplayName(
  user: { role: Role; displayNameChangedAt: Date | null | undefined },
  now = new Date()
) {
  if (hasOwnerPrivileges(user.role)) return true;
  const nextChangeAt = nextDisplayNameChangeAt(user.displayNameChangedAt);
  return nextChangeAt === null || nextChangeAt.getTime() <= now.getTime();
}

export function displayNameActuallyChanged(currentName: string, nextName: string) {
  return currentName.normalize("NFKC") !== nextName.normalize("NFKC");
}
