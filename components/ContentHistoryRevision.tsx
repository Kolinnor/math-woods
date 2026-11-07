import { RevisionDiff } from "@/components/RevisionDiff";
import { contentHistory, historyCopy, type ContentHistory } from "@/lib/content-history";
import type { Dictionary } from "@/lib/i18n/types";

export function ContentHistoryRevision({ before, after, revisionId, beforeRevisionId, locale, labels }: {
  before?: Partial<ContentHistory> | null; after?: Partial<ContentHistory> | null;
  revisionId: number; beforeRevisionId?: number; locale: string; labels: Dictionary["historyPage"];
}) {
  if (after?.historyMarkdown === undefined) return null;
  const current = contentHistory(after), previous = contentHistory(before), copy = historyCopy(locale);
  if (!current.historyMarkdown && !previous.historyMarkdown) return null;
  const changed = beforeRevisionId !== undefined && (current.historyMarkdown !== previous.historyMarkdown ||
    current.historyEnabled !== previous.historyEnabled || current.historySpoiler !== previous.historySpoiler);
  // Keep spoiler history behind its explicit warning even when it changed.
  return <details className="mt-3 content-history-revision" open={changed && !current.historySpoiler && !previous.historySpoiler}>
    <summary>{copy.title}{(current.historySpoiler || previous.historySpoiler) ? ` — ${copy.warning}` : ""}</summary>
    <p className="muted text-sm">{copy.show} : {current.historyEnabled ? (locale === "fr" ? "Oui" : "Yes") : (locale === "fr" ? "Non" : "No")}</p>
    {beforeRevisionId === undefined && <pre className="whitespace-pre-wrap break-words">{current.historyMarkdown}</pre>}
    {beforeRevisionId !== undefined && <RevisionDiff afterMarkdown={current.historyMarkdown} beforeMarkdown={previous.historyMarkdown}
      beforeRevisionId={beforeRevisionId} revisionId={revisionId} labels={labels} defaultOpen={changed} />}
  </details>;
}
