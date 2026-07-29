import { Prisma, QualityStatus } from "@prisma/client";
import type { PermissionUser } from "@/lib/permissions";

type ProblemVisibilityTarget = {
  authorId: number;
  qualityStatus: QualityStatus;
};

export function canViewProblem(
  _user: PermissionUser | null | undefined,
  _problem: ProblemVisibilityTarget
) {
  return true;
}

export function visibleProblemWhere(
  _user: PermissionUser | null | undefined
): Prisma.ProblemWhereInput {
  return {};
}
