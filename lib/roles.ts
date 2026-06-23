import { Role } from "@prisma/client";

export const ASSIGNABLE_ROLES = [Role.USER, Role.MODERATOR, Role.ADMIN] as const;

export function roleLabel(role: Role) {
  switch (role) {
    case Role.OWNER:
      return "Owner";
    case Role.ADMIN:
      return "Admin";
    case Role.MODERATOR:
      return "Moderator";
    case Role.USER:
    default:
      return "User";
  }
}

export function canModerate(role: Role) {
  return role === Role.MODERATOR || role === Role.ADMIN || role === Role.OWNER;
}

export function canAdminister(role: Role) {
  return role === Role.ADMIN || role === Role.OWNER;
}

export function isOwner(role: Role) {
  return role === Role.OWNER;
}
