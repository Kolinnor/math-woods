import { Role } from "@prisma/client";
import {
  OWNER_ASSIGNABLE_ROLES,
  canUseAdminTools,
  canUseModerationTools,
  canUseOwnerTools
} from "./permissions.ts";

export const ASSIGNABLE_ROLES = OWNER_ASSIGNABLE_ROLES;

export function roleLabel(role: Role) {
  switch (role) {
    case Role.OWNER:
      return "Owner";
    case Role.ADMIN:
      return "Admin";
    case Role.MODERATOR:
      return "Trusted user";
    case Role.USER:
    default:
      return "User";
  }
}

export function canModerate(role: Role) {
  return canUseModerationTools(role);
}

export function canAdminister(role: Role) {
  return canUseAdminTools(role);
}

export function isOwner(role: Role) {
  return canUseOwnerTools(role);
}
