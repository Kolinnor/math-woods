import {
  ExplorationBlockKind,
  ExplorationCollaboratorRole,
  ExplorationStatus,
  PlaylistVisibility,
  Role
} from "@prisma/client";
import { hasTrustedPrivileges } from "@/lib/permissions";

type ExplorationUser = { id: number; role: Role } | null | undefined;

type ExplorationAccessTarget = {
  authorId: number;
  status: ExplorationStatus;
  visibility: PlaylistVisibility;
  collaborators?: Array<{ userId: number; role: ExplorationCollaboratorRole }>;
};

export function canEditExploration(user: ExplorationUser, exploration: ExplorationAccessTarget) {
  if (!user) return false;
  if (user.id === exploration.authorId || hasTrustedPrivileges(user.role)) return true;
  return exploration.collaborators?.some(
    (collaborator) => collaborator.userId === user.id && collaborator.role === ExplorationCollaboratorRole.EDITOR
  ) ?? false;
}

export function canReviewExploration(user: ExplorationUser, exploration: ExplorationAccessTarget) {
  if (canEditExploration(user, exploration)) return true;
  if (!user) return false;
  return exploration.collaborators?.some((collaborator) => collaborator.userId === user.id) ?? false;
}

export function canViewExploration(user: ExplorationUser, exploration: ExplorationAccessTarget, directAccess = true) {
  if (canReviewExploration(user, exploration)) return true;
  if (exploration.status !== ExplorationStatus.PUBLISHED) return false;
  if (exploration.visibility === PlaylistVisibility.PRIVATE) return false;
  if (exploration.visibility === PlaylistVisibility.UNLISTED) return directAccess;
  return true;
}

export const explorationCatalogWhere = {
  status: ExplorationStatus.PUBLISHED,
  visibility: PlaylistVisibility.PUBLIC
} as const;

export function explorationBlockLabel(kind: ExplorationBlockKind) {
  const labels: Record<ExplorationBlockKind, string> = {
    MARKDOWN: "Text",
    HEADING: "Section heading",
    DEFINITION: "Definition",
    THEOREM: "Theorem",
    LEMMA: "Lemma",
    PROPOSITION: "Proposition",
    COROLLARY: "Corollary",
    PROOF: "Proof",
    EXAMPLE: "Example",
    COUNTEREXAMPLE: "Counterexample",
    REMARK: "Remark",
    CALLOUT: "Callout",
    IMAGE: "Image",
    DIVIDER: "Divider",
    PROBLEM: "Problem",
    CONCEPT: "Concept",
    QUIZ: "Quiz",
    CHOICE: "Choice"
  };
  return labels[kind];
}

export function clampOptionalInteger(value: FormDataEntryValue | null, minimum: number, maximum: number) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Value must be a whole number between ${minimum} and ${maximum}.`);
  }
  return parsed;
}
