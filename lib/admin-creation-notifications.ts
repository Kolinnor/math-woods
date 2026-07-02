import { Role } from "@prisma/client";
import { hasAdminPrivileges } from "./permissions.ts";

export function shouldNotifyAdminsOfContributorCreation(actorRole: Role) {
  // Admin-created accounts/problems/concepts are intentionally not broadcast because admins create many of them.
  return !hasAdminPrivileges(actorRole);
}
