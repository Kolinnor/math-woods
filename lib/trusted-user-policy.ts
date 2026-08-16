import { Role } from "@prisma/client";

export const TRUSTED_USER_REPUTATION_THRESHOLD = 100;

export function isTrustedUserCandidate(role: Role, reputation: number) {
  return role === Role.USER
    && Number.isFinite(reputation)
    && reputation >= TRUSTED_USER_REPUTATION_THRESHOLD;
}
