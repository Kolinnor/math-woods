import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { renderMarkdownCollectionForContentLanguage } from "@/lib/translated-markdown";

type StatementVersion = { title: string; bodyMarkdown: string };

/**
 * Renders the public text next to the proposed one on moderation pages, so reviewers can
 * read a proposed edit in its full context instead of only the line diff.
 */
export async function ProposalStatementPreview({
  current,
  proposed,
  language,
  label = "Statement"
}: {
  current: StatementVersion;
  proposed: StatementVersion;
  language: string;
  label?: string;
}) {
  const bodyChanged = current.bodyMarkdown !== proposed.bodyMarkdown;
  const titleChanged = current.title !== proposed.title;
  const showProposed = bodyChanged || titleChanged;
  const [currentHtml, proposedHtml] = await renderMarkdownCollectionForContentLanguage(
    bodyChanged ? [current.bodyMarkdown, proposed.bodyMarkdown] : [current.bodyMarkdown],
    language
  );

  const panel = (heading: string | null, version: StatementVersion, html: string) => (
    <section className="grid min-w-0 content-start gap-2 rounded border border-line p-4" aria-label={heading ?? label}>
      {heading && <small className="muted">{heading}</small>}
      <h3 className="text-lg font-semibold"><AsyncMarkdownInline markdown={version.title} /></h3>
      <div className="problem-statement reading-surface">
        <MarkdownBlock html={html} />
      </div>
    </section>
  );

  return (
    <div className="grid gap-3">
      <h2 className="font-semibold">{showProposed ? `${label} in context` : `${label} (unchanged)`}</h2>
      {showProposed ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {panel("Public now", current, currentHtml)}
          {panel("Proposed", proposed, proposedHtml ?? currentHtml)}
        </div>
      ) : (
        panel(null, current, currentHtml)
      )}
    </div>
  );
}
