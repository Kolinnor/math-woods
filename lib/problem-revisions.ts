import {
  MathDomain,
  ProblemStatus,
  ProblemVerificationMode,
  QualityStatus,
  type Prisma
} from "@prisma/client";

export type ProblemRevisionSnapshot = {
  schemaVersion: 1;
  title: string;
  language: string;
  bodyMarkdown: string;
  difficulty: number | null;
  domains: Array<{ domain: MathDomain; mscCode: string; spoiler: boolean }>;
  origin: string;
  originChapter: string | null;
  originPage: string | null;
  originNote: string | null;
  listed: boolean;
  canAppearOnFrontPage: boolean;
  status: ProblemStatus;
  qualityStatus: QualityStatus;
  verificationMode: ProblemVerificationMode;
  verificationPrompt: string | null;
  verificationAnswer: string | null;
  translatedFromRevisionId: number | null;
  tags: Array<{ name: string; slug: string }>;
  spoilerTags: Array<{ name: string; slug: string }>;
  relatedProblemGroups: Array<{ title: string; slugs: string[] }>;
};

export type ProblemSnapshotSource = {
  title: string;
  language: string;
  bodyMarkdown: string;
  difficulty: number | null;
  domains: Array<{ domain: MathDomain; mscCode: string; spoiler: boolean }>;
  origin: string;
  originChapter: string | null;
  originPage: string | null;
  originNote: string | null;
  listed: boolean;
  canAppearOnFrontPage: boolean;
  status: ProblemStatus;
  qualityStatus: QualityStatus;
  verificationMode: ProblemVerificationMode;
  verificationPrompt: string | null;
  verificationAnswer: string | null;
  translatedFromRevisionId: number | null;
  tags: Array<{ tag: { name: string; slug: string } }>;
  spoilerTags: Array<{ tag: { name: string; slug: string } }>;
  relatedGroups: Array<{
    title: string;
    relations: Array<{ targetProblem: { slug: string } }>;
  }>;
};

export const PROBLEM_SNAPSHOT_FIELD_LABELS = {
  title: "title",
  language: "language",
  bodyMarkdown: "statement",
  difficulty: "difficulty",
  domains: "domains",
  origin: "origin",
  originChapter: "origin chapter",
  originPage: "origin page",
  originNote: "origin note",
  listed: "visibility",
  canAppearOnFrontPage: "front page eligibility",
  status: "publication status",
  qualityStatus: "quality",
  verificationMode: "verification mode",
  verificationPrompt: "verification prompt",
  verificationAnswer: "verification answer",
  translatedFromRevisionId: "translation freshness",
  tags: "tags",
  spoilerTags: "spoiler tags",
  relatedProblemGroups: "related problems"
} as const;

type ProblemSnapshotField = keyof typeof PROBLEM_SNAPSHOT_FIELD_LABELS;
const PROBLEM_SNAPSHOT_FIELDS = Object.keys(PROBLEM_SNAPSHOT_FIELD_LABELS) as ProblemSnapshotField[];

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildProblemRevisionSnapshot(source: ProblemSnapshotSource): ProblemRevisionSnapshot {
  return {
    schemaVersion: 1,
    title: source.title,
    language: source.language,
    bodyMarkdown: source.bodyMarkdown,
    difficulty: source.difficulty,
    domains: source.domains.map((domain) => ({
      domain: domain.domain,
      mscCode: domain.mscCode,
      spoiler: domain.spoiler
    })),
    origin: source.origin,
    originChapter: source.originChapter,
    originPage: source.originPage,
    originNote: source.originNote,
    listed: source.listed,
    canAppearOnFrontPage: source.canAppearOnFrontPage,
    status: source.status,
    qualityStatus: source.qualityStatus,
    verificationMode: source.verificationMode,
    verificationPrompt: source.verificationPrompt,
    verificationAnswer: source.verificationAnswer,
    translatedFromRevisionId: source.translatedFromRevisionId,
    tags: source.tags
      .map(({ tag }) => ({ name: tag.name, slug: tag.slug }))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    spoilerTags: source.spoilerTags
      .map(({ tag }) => ({ name: tag.name, slug: tag.slug }))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    relatedProblemGroups: source.relatedGroups.map((group) => ({
      title: group.title,
      slugs: group.relations.map(({ targetProblem }) => targetProblem.slug)
    }))
  };
}

export function problemRevisionSnapshotJson(snapshot: ProblemRevisionSnapshot): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

export function parseProblemRevisionSnapshot(value: Prisma.JsonValue | null): ProblemRevisionSnapshot | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return null;
  if (typeof candidate.title !== "string" || typeof candidate.bodyMarkdown !== "string") return null;
  if (!Array.isArray(candidate.domains) || !Array.isArray(candidate.tags) || !Array.isArray(candidate.spoilerTags)) return null;
  if (!Array.isArray(candidate.relatedProblemGroups)) return null;
  return candidate as unknown as ProblemRevisionSnapshot;
}

export function changedProblemSnapshotFields(
  before: ProblemRevisionSnapshot,
  after: ProblemRevisionSnapshot
): ProblemSnapshotField[] {
  return PROBLEM_SNAPSHOT_FIELDS.filter((field) => !sameValue(before[field], after[field]));
}

export function mergeProblemRevisionSnapshots(
  base: ProblemRevisionSnapshot,
  current: ProblemRevisionSnapshot,
  submitted: ProblemRevisionSnapshot
) {
  const merged = { ...submitted } as ProblemRevisionSnapshot;
  const conflicts: ProblemSnapshotField[] = [];

  for (const field of PROBLEM_SNAPSHOT_FIELDS) {
    const currentChanged = !sameValue(base[field], current[field]);
    const submittedChanged = !sameValue(base[field], submitted[field]);

    if (!submittedChanged) {
      (merged as unknown as Record<string, unknown>)[field] = current[field];
      continue;
    }
    if (currentChanged && !sameValue(current[field], submitted[field])) conflicts.push(field);
  }

  return { merged, conflicts };
}

export function problemSnapshotRelationInput(snapshot: ProblemRevisionSnapshot) {
  return snapshot.relatedProblemGroups
    .filter((group) => group.title && group.slugs.length)
    .map((group) => `${group.title}: ${group.slugs.join(", ")}`)
    .join("\n");
}

export function problemSnapshotTagInput(tags: ProblemRevisionSnapshot["tags"]) {
  return tags.map((tag) => tag.name).join(", ");
}
