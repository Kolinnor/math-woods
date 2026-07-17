import { Prisma, QualityStatus } from "@prisma/client";
import { hasTrustedPrivileges, type PermissionUser } from "@/lib/permissions";

type ProblemVisibilityTarget = {
  authorId: number;
  qualityStatus: QualityStatus;
};

export function canViewUnreviewedProblems(user: PermissionUser | null | undefined) {
  return Boolean(user && hasTrustedPrivileges(user.role));
}

export function canViewProblem(user: PermissionUser | null | undefined, problem: ProblemVisibilityTarget) {
  return (
    problem.qualityStatus !== QualityStatus.UNREVIEWED ||
    Boolean(user && (problem.authorId === user.id || hasTrustedPrivileges(user.role)))
  );
}

export function visibleProblemWhere(user: PermissionUser | null | undefined): Prisma.ProblemWhereInput {
  if (canViewUnreviewedProblems(user)) return {};

  return user
    ? {
        OR: [
          { qualityStatus: { not: QualityStatus.UNREVIEWED } },
          { authorId: user.id }
        ]
      }
    : { qualityStatus: { not: QualityStatus.UNREVIEWED } };
}
