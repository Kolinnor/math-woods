export type TranslationTextRevision = {
  id: number;
  markdown: string;
  title: string | null;
  history?: string;
  proofs?: string;
};

export function revisionSnapshotTitle(snapshot: unknown): string | null {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return null;
  const title = (snapshot as Record<string, unknown>).title;
  return typeof title === "string" ? title : null;
}

export function latestTranslationTextRevisionId(revisions: TranslationTextRevision[]): number | null {
  let latestRevisionId: number | null = null;
  let previousMarkdown: string | null = null;
  let previousTitle: string | null = null;
  let previousHistory = "";
  let previousProofs = "[]";
  let hasPreviousRevision = false;

  for (const revision of [...revisions].sort((left, right) => left.id - right.id)) {
    const effectiveTitle: string | null = revision.title ?? previousTitle;
    const markdownChanged = !hasPreviousRevision || revision.markdown !== previousMarkdown;
    const titleChanged =
      hasPreviousRevision &&
      previousTitle !== null &&
      effectiveTitle !== null &&
      effectiveTitle !== previousTitle;

    const history = revision.history ?? previousHistory;
    const proofs = revision.proofs ?? previousProofs;
    if (markdownChanged || titleChanged || history !== previousHistory || proofs !== previousProofs) latestRevisionId = revision.id;
    previousHistory = history;
    previousProofs = proofs;

    previousMarkdown = revision.markdown;
    previousTitle = effectiveTitle;
    hasPreviousRevision = true;
  }

  return latestRevisionId;
}

export function latestProblemTextRevisionIdFromRevisions(
  revisions: Array<{ id: number; markdown: string; problemSnapshot: unknown }>
) {
  return latestTranslationTextRevisionId(
    revisions.map((revision) => ({
      id: revision.id,
      markdown: revision.markdown,
      history: revisionHistory(revision.problemSnapshot),
      title: revisionSnapshotTitle(revision.problemSnapshot)
    }))
  );
}

export function latestConceptTextRevisionIdFromRevisions(
  revisions: Array<{ id: number; markdown: string; conceptTitle: string | null; conceptSnapshot?: unknown }>
) {
  return latestTranslationTextRevisionId(
    revisions.map((revision) => ({
      id: revision.id,
      markdown: revision.markdown,
      history: revisionHistory(revision.conceptSnapshot),
      proofs: revisionProofs(revision.conceptSnapshot),
      title: revision.conceptTitle ?? revisionSnapshotTitle(revision.conceptSnapshot)
    }))
  );
}

function revisionHistory(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== "object" || !("historyMarkdown" in snapshot)) return undefined;
  const value = snapshot as { historyMarkdown: string; historyEnabled?: boolean; historySpoiler?: boolean };
  if (!value.historyMarkdown && !value.historyEnabled && !value.historySpoiler) return "";
  return JSON.stringify([value.historyMarkdown, value.historyEnabled === true, value.historySpoiler === true]);
}

function revisionProofs(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== "object" || !("proofs" in snapshot)) return undefined;
  return JSON.stringify(snapshot.proofs);
}
