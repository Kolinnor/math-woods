import { ConceptStatus, QualityStatus, Role } from "@prisma/client";

export type PermissionUser = {
  id: number;
  role: Role;
  emailVerifiedAt?: Date | null;
};

type AuthoredResource = {
  authorId: number | null;
};

type CreatedResource = {
  createdById: number | null;
};

type ProblemPermissionTarget = {
  authorId: number;
};

type PlaylistPermissionTarget = {
  authorId: number;
};

type VerificationRequestPermissionTarget = {
  userId: number;
  problem: ProblemPermissionTarget;
};

export const OWNER_ASSIGNABLE_ROLES = [Role.USER, Role.MODERATOR, Role.ADMIN] as const;
export const ADMIN_ASSIGNABLE_ROLES = [Role.USER, Role.MODERATOR] as const;

export function hasTrustedPrivileges(role: Role) {
  return role === Role.MODERATOR || role === Role.ADMIN || role === Role.OWNER;
}

export function hasAdminPrivileges(role: Role) {
  return role === Role.ADMIN || role === Role.OWNER;
}

export function hasOwnerPrivileges(role: Role) {
  return role === Role.OWNER;
}

export function isVerifiedContributor(user: PermissionUser) {
  return Boolean(user.emailVerifiedAt) || hasTrustedPrivileges(user.role);
}

export function canUseModerationTools(userOrRole: PermissionUser | Role) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  return hasTrustedPrivileges(role);
}

export function canUseAdminTools(userOrRole: PermissionUser | Role) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  return hasAdminPrivileges(role);
}

export function canUseOwnerTools(userOrRole: PermissionUser | Role) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  return hasOwnerPrivileges(role);
}

export function canManageUserRoles(userOrRole: PermissionUser | Role) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  return hasOwnerPrivileges(role);
}

export function assignableRolesFor(role: Role): readonly Role[] {
  if (hasOwnerPrivileges(role)) return OWNER_ASSIGNABLE_ROLES;
  if (role === Role.ADMIN) return ADMIN_ASSIGNABLE_ROLES;
  return [];
}

export function canAssignRole(actor: PermissionUser, target: { id: number; role: Role }, nextRole: Role) {
  if (actor.id === target.id) return false;
  if (target.role === Role.OWNER || nextRole === Role.OWNER) return false;
  if (!assignableRolesFor(actor.role).includes(nextRole)) return false;
  if (actor.role === Role.ADMIN && target.role === Role.ADMIN) return false;
  return true;
}

export function canCreateProblem(user: PermissionUser) {
  return isVerifiedContributor(user);
}

export function canViewArchivedProblem(user: PermissionUser | null | undefined, problem: ProblemPermissionTarget) {
  return Boolean(user && (problem.authorId === user.id || hasTrustedPrivileges(user.role)));
}

export function canEditProblem(user: PermissionUser, problem: ProblemPermissionTarget) {
  return problem.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canRollbackProblem(user: PermissionUser, problem: ProblemPermissionTarget) {
  return canEditProblem(user, problem);
}

export function canArchiveProblem(user: PermissionUser, problem: ProblemPermissionTarget) {
  return problem.authorId === user.id || hasAdminPrivileges(user.role);
}

export function canDeleteProblem(user: PermissionUser, problem: ProblemPermissionTarget) {
  return canArchiveProblem(user, problem);
}

export function canSetProblemQualityStatus(role: Role, status: QualityStatus) {
  if (status === QualityStatus.UNREVIEWED || status === QualityStatus.NEEDS_WORK) return true;
  if (status === QualityStatus.GOOD) return hasTrustedPrivileges(role);
  if (status === QualityStatus.EXCELLENT) return hasAdminPrivileges(role);
  return false;
}

export function canEditSolution(user: PermissionUser, solution: AuthoredResource) {
  return solution.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canDeleteSolution(user: PermissionUser, solution: AuthoredResource) {
  return canEditSolution(user, solution);
}

export function canEditConcept(user: PermissionUser, concept: CreatedResource) {
  return concept.createdById === user.id || hasTrustedPrivileges(user.role);
}

export function canRollbackConcept(user: PermissionUser, concept: CreatedResource) {
  return canEditConcept(user, concept);
}

export function canDeleteConcept(user: PermissionUser, _concept: CreatedResource) {
  return hasAdminPrivileges(user.role);
}

export function canSetConceptStatus(role: Role, status: ConceptStatus) {
  if (!Object.values(ConceptStatus).includes(status)) return false;
  if (hasAdminPrivileges(role)) return true;
  if (!hasTrustedPrivileges(role)) return false;
  return status !== ConceptStatus.EXCELLENT;
}

export function canEditPlaylist(user: PermissionUser, playlist: PlaylistPermissionTarget) {
  return playlist.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canDeletePlaylist(user: PermissionUser, playlist: PlaylistPermissionTarget) {
  return playlist.authorId === user.id || hasAdminPrivileges(user.role);
}

export function canJoinProblemDiscussion(
  user: PermissionUser,
  problem: ProblemPermissionTarget,
  attempt: { id: number } | null | undefined
) {
  return Boolean(attempt) || problem.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canEditDiscussionHint(user: PermissionUser, hint: AuthoredResource) {
  return hint.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canRevealHintWithoutAttempt(
  user: PermissionUser,
  hint: AuthoredResource,
  problem: ProblemPermissionTarget
) {
  return hint.authorId === user.id || problem.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canReviewProblemVerification(user: PermissionUser, problem: ProblemPermissionTarget) {
  return problem.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canJoinVerificationDiscussion(user: PermissionUser, request: VerificationRequestPermissionTarget) {
  return request.userId === user.id || request.problem.authorId === user.id || hasTrustedPrivileges(user.role);
}
