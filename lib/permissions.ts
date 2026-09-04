import { ConceptStatus, LibraryStatus, QualityStatus, Role } from "@prisma/client";

export type PermissionUser = {
  id: number;
  role: Role;
  emailVerifiedAt?: Date | null;
};

type AuthoredResource = {
  authorId: number | null;
  translatedById?: number | null;
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

export function canCreateLibraryEntry(user: PermissionUser) {
  return isVerifiedContributor(user);
}

export function canViewLibraryEntry(
  user: PermissionUser | null,
  entry: { createdById: number | null; status: LibraryStatus }
) {
  if (entry.status === LibraryStatus.PUBLISHED) return true;
  if (!user) return false;
  if (entry.createdById === user.id) return true;
  if (entry.status === LibraryStatus.PENDING_REVIEW) return hasTrustedPrivileges(user.role);
  return entry.status === LibraryStatus.ARCHIVED && hasAdminPrivileges(user.role);
}

export function canEditLibraryDraft(
  user: PermissionUser,
  entry: { createdById: number | null; status: LibraryStatus }
) {
  if (entry.status === LibraryStatus.PUBLISHED) return hasTrustedPrivileges(user.role);
  if (entry.status === LibraryStatus.ARCHIVED) return hasAdminPrivileges(user.role);
  return entry.createdById === user.id && (
    entry.status === LibraryStatus.DRAFT || entry.status === LibraryStatus.NEEDS_WORK
  );
}

export function canReviewLibraryEntry(
  user: PermissionUser,
  entry: { createdById: number | null }
) {
  if (!hasTrustedPrivileges(user.role)) return false;
  return hasAdminPrivileges(user.role) || entry.createdById !== user.id;
}

export function canArchiveLibraryEntry(user: PermissionUser) {
  return hasAdminPrivileges(user.role);
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

export function canProposeProblemEdit(user: PermissionUser) {
  return isVerifiedContributor(user);
}

export function canPublishProblemEdit(user: PermissionUser) {
  return hasTrustedPrivileges(user.role);
}

export function canPublishProblemEditForTarget(
  user: PermissionUser,
  problem: ProblemPermissionTarget,
  hasApprovedProposal: boolean
) {
  return canPublishProblemEdit(user) || problem.authorId === user.id || hasApprovedProposal;
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

export function canTransferProblemAttribution(userOrRole: PermissionUser | Role) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  return hasAdminPrivileges(role);
}

export function canSetProblemQualityStatus(role: Role, status: QualityStatus) {
  if (status === QualityStatus.UNREVIEWED || status === QualityStatus.NEEDS_WORK) return true;
  if (status === QualityStatus.REVIEWED) return hasTrustedPrivileges(role);
  return false;
}

export function canReviewProblem(user: PermissionUser, problem: ProblemPermissionTarget) {
  return (
    problem.authorId !== user.id &&
    canSetProblemQualityStatus(user.role, QualityStatus.REVIEWED)
  );
}

const PROBLEM_QUALITY_RANK: Record<QualityStatus, number> = {
  [QualityStatus.NEEDS_WORK]: 0,
  [QualityStatus.UNREVIEWED]: 1,
  [QualityStatus.REVIEWED]: 2
};

export function canDowngradeProblemQualityStatus(
  user: PermissionUser,
  problem: ProblemPermissionTarget & { qualityStatus: QualityStatus },
  nextStatus: QualityStatus
) {
  const currentRank = PROBLEM_QUALITY_RANK[problem.qualityStatus];
  const nextRank = PROBLEM_QUALITY_RANK[nextStatus];
  if (nextRank >= currentRank) return false;
  return problem.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canEditSolution(user: PermissionUser, solution: AuthoredResource) {
  return solution.authorId === user.id || solution.translatedById === user.id || hasTrustedPrivileges(user.role);
}

export function canDeleteSolution(user: PermissionUser, solution: AuthoredResource) {
  return canEditSolution(user, solution);
}

export function canEditConcept(user: PermissionUser, concept: CreatedResource) {
  return concept.createdById === user.id || hasTrustedPrivileges(user.role);
}

export function canProposeConceptEdit(user: PermissionUser) {
  return isVerifiedContributor(user);
}

export function canPublishConceptEditForTarget(
  user: PermissionUser,
  concept: CreatedResource,
  hasApprovedProposal: boolean
) {
  return hasTrustedPrivileges(user.role) || concept.createdById === user.id || hasApprovedProposal;
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

export function canReviewConcept(user: PermissionUser, concept: CreatedResource) {
  return concept.createdById !== user.id && canSetConceptStatus(user.role, ConceptStatus.REVIEWED);
}

const CONCEPT_COMPLETENESS_RANK: Partial<Record<ConceptStatus, number>> = {
  [ConceptStatus.STUB]: 0,
  [ConceptStatus.USABLE]: 1,
  [ConceptStatus.REVIEWED]: 2,
  [ConceptStatus.EXCELLENT]: 3
};

export function canDowngradeConceptStatus(
  user: PermissionUser,
  concept: CreatedResource & { status: ConceptStatus },
  nextStatus: ConceptStatus
) {
  const currentRank = CONCEPT_COMPLETENESS_RANK[concept.status];
  const nextRank = CONCEPT_COMPLETENESS_RANK[nextStatus];
  if (currentRank === undefined || nextRank === undefined || nextRank >= currentRank) return false;
  if (nextStatus !== ConceptStatus.STUB && nextStatus !== ConceptStatus.USABLE) return false;

  return concept.createdById === user.id || hasTrustedPrivileges(user.role);
}

export function canChangeConceptStatus(
  user: PermissionUser,
  concept: CreatedResource & { status: ConceptStatus },
  nextStatus: ConceptStatus
) {
  if (nextStatus === concept.status) return true;
  if (canDowngradeConceptStatus(user, concept, nextStatus)) return true;
  if (!canSetConceptStatus(user.role, nextStatus)) return false;
  if (nextStatus === ConceptStatus.USABLE) {
    return (
      (concept.status === ConceptStatus.STUB || concept.status === ConceptStatus.MISSING) &&
      canReviewConcept(user, concept)
    );
  }
  if (nextStatus === ConceptStatus.REVIEWED) {
    return concept.status === ConceptStatus.USABLE && canReviewConcept(user, concept);
  }
  if (nextStatus === ConceptStatus.EXCELLENT) {
    return concept.status === ConceptStatus.REVIEWED && canReviewConcept(user, concept);
  }
  return true;
}

export function canEditPlaylist(user: PermissionUser, playlist: PlaylistPermissionTarget) {
  return playlist.authorId === user.id || hasTrustedPrivileges(user.role);
}

export function canDeletePlaylist(user: PermissionUser, playlist: PlaylistPermissionTarget) {
  return playlist.authorId === user.id || hasAdminPrivileges(user.role);
}

export function canEditDiscussionPost(user: PermissionUser, post: AuthoredResource) {
  return post.authorId === user.id;
}

export function canEditVerificationMessage(user: PermissionUser, message: AuthoredResource) {
  return message.authorId === user.id;
}

export function canEditProofComment(user: PermissionUser, comment: AuthoredResource) {
  return comment.authorId === user.id;
}

export function canEditConceptTalkPost(user: PermissionUser, post: AuthoredResource) {
  return post.authorId === user.id;
}

export function canReviewProblemVerification(user: PermissionUser, problem: ProblemPermissionTarget) {
  return problem.authorId === user.id;
}

export function canJoinVerificationDiscussion(user: PermissionUser, request: VerificationRequestPermissionTarget) {
  return request.userId === user.id || request.problem.authorId === user.id;
}
