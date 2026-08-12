export type TranslationTextRevision = {
  id: number;
  markdown: string;
  title: string | null;
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
  let hasPreviousRevision = false;

  for (const revision of [...revisions].sort((left, right) => left.id - right.id)) {
    const effectiveTitle: string | null = revision.title ?? previousTitle;
    const markdownChanged = !hasPreviousRevision || revision.markdown !== previousMarkdown;
    const titleChanged =
      hasPreviousRevision &&
      previousTitle !== null &&
      effectiveTitle !== null &&
      effectiveTitle !== previousTitle;

    if (markdownChanged || titleChanged) latestRevisionId = revision.id;

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
      title: revision.conceptTitle ?? revisionSnapshotTitle(revision.conceptSnapshot)
    }))
  );
}
