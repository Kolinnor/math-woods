import { buildRevisionDiff, compactRevisionDiffParts, type RevisionDiffRow } from "@/lib/revision-diff";

export function RevisionDiff({
  afterMarkdown,
  beforeMarkdown,
  beforeRevisionId,
  defaultOpen = false,
  revisionId,
  labels
}: {
  afterMarkdown: string;
  beforeMarkdown: string;
  beforeRevisionId: number;
  defaultOpen?: boolean;
  revisionId: number;
  labels?: {
    compareWith: (id: number) => string;
    changedLines: (count: number) => string;
    changedPassages?: (count: number) => string;
    noTextChanges: string;
    diffAria: (id: number) => string;
    showAll?: string;
    showChangesOnly?: string;
    omittedLines?: (count: number) => string;
  };
}) {
  const rows = buildRevisionDiff(beforeMarkdown, afterMarkdown);
  const changedRows = rows.filter((row) => row.kind !== "context").length;
  const changedPassages = rows.filter((row, index) => row.kind !== "context" && (index === 0 || rows[index - 1].kind === "context")).length;
  const tableLabel = labels?.diffAria(revisionId) ?? `Revision ${revisionId} diff`;
  const renderRow = (row: RevisionDiffRow, rowIndex: number, compact: boolean) => (
    <div key={`${row.kind}-${rowIndex}`} className={`revision-diff-row revision-diff-${row.kind}`} role="row">
      <span className="revision-diff-marker" role="cell" aria-hidden="true">
        {row.kind === "removed" ? "−" : row.kind === "added" ? "+" : " "}
      </span>
      <span className="revision-diff-line" role="cell">{row.kind === "added" ? row.afterLine : row.beforeLine}</span>
      <code role="cell">
        {(compact ? compactRevisionDiffParts(row.parts) : row.parts).map((part, partIndex) => (
          <span key={partIndex} className={part.changed ? "revision-diff-highlight" : undefined}>{part.value}</span>
        ))}
      </code>
    </div>
  );
  let omitted = 0;
  const focusedRows = rows.flatMap((row, index) => {
    if (row.kind === "context") {
      omitted += 1;
      if (index < rows.length - 1) return [];
    }
    const gap = omitted ? [<div key={`gap-${index}`} className="revision-diff-gap" role="row">
      <span role="cell">{labels?.omittedLines?.(omitted) ?? `${omitted} unchanged lines hidden`}</span>
    </div>] : [];
    omitted = 0;
    return row.kind === "context" ? gap : [...gap, renderRow(row, index, true)];
  });

  return (
    <details className="revision-diff mt-3" open={defaultOpen}>
      <summary>
        <span>{labels?.compareWith(beforeRevisionId) ?? `Compare with revision ${beforeRevisionId}`}</span>
        <small>{changedRows ? (labels?.changedPassages?.(changedPassages) ?? labels?.changedLines(changedRows) ?? `${changedRows} changed lines`) : (labels?.noTextChanges ?? "No text changes")}</small>
      </summary>
      <details className="revision-diff-full">
        <summary>
          <span className="revision-diff-expand-label">{labels?.showAll ?? "Show all"}</span>
          <span className="revision-diff-collapse-label">{labels?.showChangesOnly ?? "Show changes only"}</span>
        </summary>
        <div className="revision-diff-table" role="table" aria-label={tableLabel}>
          {rows.map((row, index) => renderRow(row, index, false))}
        </div>
      </details>
      {changedRows > 0 && <div className="revision-diff-table revision-diff-focused" role="table" aria-label={tableLabel}>
        {focusedRows}
      </div>}
    </details>
  );
}
