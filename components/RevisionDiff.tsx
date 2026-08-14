import { buildRevisionDiff } from "@/lib/revision-diff";

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
    noTextChanges: string;
    diffAria: (id: number) => string;
  };
}) {
  const rows = buildRevisionDiff(beforeMarkdown, afterMarkdown);
  const changedRows = rows.filter((row) => row.kind !== "context").length;

  return (
    <details className="revision-diff mt-3" open={defaultOpen}>
      <summary>
        <span>{labels?.compareWith(beforeRevisionId) ?? `Compare with revision ${beforeRevisionId}`}</span>
        <small>{changedRows ? (labels?.changedLines(changedRows) ?? `${changedRows} changed lines`) : (labels?.noTextChanges ?? "No text changes")}</small>
      </summary>
      <div className="revision-diff-table" role="table" aria-label={labels?.diffAria(revisionId) ?? `Revision ${revisionId} diff`}>
        {rows.map((row, rowIndex) => (
          <div key={`${row.kind}-${rowIndex}`} className={`revision-diff-row revision-diff-${row.kind}`} role="row">
            <span className="revision-diff-marker" aria-hidden="true">
              {row.kind === "removed" ? "-" : row.kind === "added" ? "+" : " "}
            </span>
            <span className="revision-diff-line">{row.kind === "added" ? row.afterLine : row.beforeLine}</span>
            <code>
              {row.parts.map((part, partIndex) => (
                <span key={partIndex} className={part.changed ? "revision-diff-highlight" : undefined}>
                  {part.value}
                </span>
              ))}
            </code>
          </div>
        ))}
      </div>
    </details>
  );
}
