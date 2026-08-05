import { ConceptKind, ConceptStatus, type Prisma } from "@prisma/client";

export const conceptRevisionSnapshotInclude = {
  aliases: { orderBy: { aliasSlug: "asc" as const } },
  references: { orderBy: { position: "asc" as const } },
  practiceExercises: {
    orderBy: { position: "asc" as const },
    include: { problem: { select: { id: true, slug: true, title: true } } }
  }
} satisfies Prisma.ConceptInclude;

export type ConceptSnapshotSource = Prisma.ConceptGetPayload<{
  include: typeof conceptRevisionSnapshotInclude;
}>;

export type ConceptRevisionSnapshot = {
  schemaVersion: 1;
  title: string;
  language: string;
  bodyMarkdown: string;
  domainCode: string;
  kind: ConceptKind;
  status: ConceptStatus;
  needsReviewAfterEdit: boolean;
  canAppearInConceptBrowser: boolean;
  translatedFromRevisionId: number | null;
  aliases: Array<{ alias: string; aliasSlug: string }>;
  references: Array<{ title: string; url: string | null; note: string | null }>;
  practiceExercises: Array<{ id: number; slug: string; title: string }>;
};

export const CONCEPT_SNAPSHOT_FIELD_LABELS = {
  title: "title",
  language: "language",
  bodyMarkdown: "text",
  domainCode: "domain",
  kind: "type",
  status: "status",
  needsReviewAfterEdit: "review state",
  canAppearInConceptBrowser: "browser visibility",
  translatedFromRevisionId: "translation freshness",
  aliases: "aliases",
  references: "references",
  practiceExercises: "linked exercises"
} as const;

export type ConceptSnapshotField = keyof typeof CONCEPT_SNAPSHOT_FIELD_LABELS;
const CONCEPT_SNAPSHOT_FIELDS = Object.keys(CONCEPT_SNAPSHOT_FIELD_LABELS) as ConceptSnapshotField[];

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildConceptRevisionSnapshot(source: ConceptSnapshotSource): ConceptRevisionSnapshot {
  return {
    schemaVersion: 1,
    title: source.title,
    language: source.language,
    bodyMarkdown: source.bodyMarkdown,
    domainCode: source.domainCode,
    kind: source.kind,
    status: source.status,
    needsReviewAfterEdit: source.needsReviewAfterEdit,
    canAppearInConceptBrowser: source.canAppearInConceptBrowser,
    translatedFromRevisionId: source.translatedFromRevisionId,
    aliases: source.aliases.map(({ alias, aliasSlug }) => ({ alias, aliasSlug })),
    references: source.references.map(({ title, url, note }) => ({ title, url, note })),
    practiceExercises: source.practiceExercises.map(({ problem }) => ({
      id: problem.id,
      slug: problem.slug,
      title: problem.title
    }))
  };
}

export function conceptRevisionSnapshotJson(snapshot: ConceptRevisionSnapshot): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

export function parseConceptRevisionSnapshot(value: Prisma.JsonValue | null): ConceptRevisionSnapshot | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return null;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.language !== "string" ||
    typeof candidate.bodyMarkdown !== "string" ||
    typeof candidate.domainCode !== "string" ||
    !Object.values(ConceptKind).includes(candidate.kind as ConceptKind) ||
    !Object.values(ConceptStatus).includes(candidate.status as ConceptStatus) ||
    !Array.isArray(candidate.aliases) ||
    !Array.isArray(candidate.references) ||
    !Array.isArray(candidate.practiceExercises)
  ) {
    return null;
  }
  return candidate as unknown as ConceptRevisionSnapshot;
}

export function changedConceptSnapshotFields(
  before: ConceptRevisionSnapshot,
  after: ConceptRevisionSnapshot
): ConceptSnapshotField[] {
  return CONCEPT_SNAPSHOT_FIELDS.filter((field) => {
    if (field === "practiceExercises") {
      return !sameValue(
        before.practiceExercises.map((exercise) => exercise.id),
        after.practiceExercises.map((exercise) => exercise.id)
      );
    }
    return !sameValue(before[field], after[field]);
  });
}

export function conceptRevisionAutomaticSummary(fields: ConceptSnapshotField[]) {
  const labels = fields.map((field) => CONCEPT_SNAPSHOT_FIELD_LABELS[field]);
  if (!labels.length) return "Concept saved without content changes";
  if (labels.length === 1) return `Updated ${labels[0]}`;
  return `Updated ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}
