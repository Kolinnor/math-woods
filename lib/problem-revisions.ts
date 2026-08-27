import {
  MathDomain,
  ProblemStatus,
  ProblemStyle,
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
  knownSourceId: number | null;
  listed: boolean;
  isExercise: boolean;
  isConjecture: boolean;
  styles: ProblemStyle[];
  showRelatedProblems: boolean;
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
  knownSourceId: number | null;
  listed: boolean;
  isExercise: boolean;
  isConjecture: boolean;
  styles: ProblemStyle[];
  showRelatedProblems: boolean;
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
  knownSourceId: "recognized source",
  listed: "visibility",
  isExercise: "content type",
  isConjecture: "conjecture status",
  styles: "problem styles",
  showRelatedProblems: "related-problems visibility",
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

export type ProblemSnapshotField = keyof typeof PROBLEM_SNAPSHOT_FIELD_LABELS;
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
    knownSourceId: source.knownSourceId,
    listed: source.listed,
    isExercise: source.isExercise,
    isConjecture: source.isConjecture,
    styles: source.styles,
    showRelatedProblems: source.showRelatedProblems,
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
  const legacyQualityStatus = String(candidate.qualityStatus ?? "");
  const qualityStatus = Object.values(QualityStatus).includes(legacyQualityStatus as QualityStatus)
    ? (legacyQualityStatus as QualityStatus)
    : legacyQualityStatus === "GOOD" || legacyQualityStatus === "EXCELLENT"
      ? QualityStatus.REVIEWED
      : QualityStatus.UNREVIEWED;

  return {
    ...candidate,
    qualityStatus,
    isExercise: candidate.isExercise === true,
    isConjecture:
      typeof candidate.isConjecture === "boolean"
        ? candidate.isConjecture
        : (candidate.tags as Array<{ slug?: unknown }>).some((tag) => tag.slug === "conjecture"),
    styles: Array.isArray(candidate.styles)
      ? candidate.styles.filter((style): style is ProblemStyle => Object.values(ProblemStyle).includes(style as ProblemStyle))
      : [],
    showRelatedProblems:
      typeof candidate.showRelatedProblems === "boolean"
        ? candidate.showRelatedProblems
        : candidate.isExercise !== true,
    canAppearOnFrontPage:
      candidate.canAppearOnFrontPage === true || legacyQualityStatus === "EXCELLENT",
    knownSourceId:
      typeof candidate.knownSourceId === "number" && Number.isInteger(candidate.knownSourceId)
        ? candidate.knownSourceId
        : null
  } as unknown as ProblemRevisionSnapshot;
}

export function changedProblemSnapshotFields(
  before: ProblemRevisionSnapshot,
  after: ProblemRevisionSnapshot
): ProblemSnapshotField[] {
  return PROBLEM_SNAPSHOT_FIELDS.filter((field) => !sameValue(before[field], after[field]));
}

export function formatProblemSnapshotFieldValue(
  field: ProblemSnapshotField,
  value: ProblemRevisionSnapshot[ProblemSnapshotField]
) {
  if (value === null || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field === "domains" && Array.isArray(value)) {
    return (value as ProblemRevisionSnapshot["domains"])
      .map((domain) => `${domain.mscCode}${domain.spoiler ? " (spoiler)" : ""}`)
      .join(", ") || "None";
  }
  if ((field === "tags" || field === "spoilerTags") && Array.isArray(value)) {
    return (value as ProblemRevisionSnapshot["tags"]).map((tag) => tag.name).join(", ") || "None";
  }
  if (field === "styles" && Array.isArray(value)) {
    return (value as ProblemStyle[]).map((style) => style.toLowerCase().replaceAll("_", " ")).join(", ") || "None";
  }
  if (field === "relatedProblemGroups" && Array.isArray(value)) {
    return (value as ProblemRevisionSnapshot["relatedProblemGroups"])
      .map((group) => `${group.title}: ${group.slugs.join(", ")}`)
      .join("; ") || "None";
  }
  return String(value);
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
