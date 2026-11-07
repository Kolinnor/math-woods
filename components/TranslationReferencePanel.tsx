import { contentWithProofs } from "@/lib/concept-proofs";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { contentLanguageLabel } from "@/lib/languages";
import { renderMarkdownForContentLanguage } from "@/lib/translated-markdown";

type TranslationReferencePanelProps = {
  basedOnRevisionId?: number | null;
  href?: string;
  idPrefix?: string;
  latestRevisionId?: number | null;
  title: string;
  language: string;
  markdown: string;
  historyMarkdown?: string;
  proofs?: unknown;
  stale?: boolean;
};

export async function TranslationReferencePanel({
  basedOnRevisionId,
  href,
  idPrefix = "translation-source",
  latestRevisionId,
  title,
  language,
  markdown,
  historyMarkdown,
  proofs,
  stale = false
}: TranslationReferencePanelProps) {
  const referenceMarkdown = historyMarkdown?.trim() ? `${markdown}\n\n## ${language === "fr" ? "Histoire" : "History"}\n\n${historyMarkdown}` : markdown;
  const html = await renderMarkdownForContentLanguage(contentWithProofs(referenceMarkdown, { proofs }), language);
  const renderedId = `${idPrefix}-rendered`;
  const markdownId = `${idPrefix}-markdown`;
  const groupName = `${idPrefix}-mode`;

  return (
    <aside className="translation-reference-panel">
      <div className="translation-reference-header">
        <div>
          <span>Reference</span>
          <strong>{contentLanguageLabel(language)}</strong>
        </div>
        {href && (
          <a href={href} className="translation-reference-link">
            Open
          </a>
        )}
      </div>
      <h2><AsyncMarkdownInline markdown={title} /></h2>
      {(stale || latestRevisionId || basedOnRevisionId) && (
        <p className={stale ? "translation-reference-status stale" : "translation-reference-status"}>
          {stale
            ? `Source text changed after revision ${basedOnRevisionId ?? "unknown"}. Latest source text revision: ${latestRevisionId}.`
            : latestRevisionId
              ? `Based on source text revision ${basedOnRevisionId ?? latestRevisionId}.`
              : "Source revision unavailable."}
        </p>
      )}
      <div className="translation-reference-tabs">
        <input
          id={renderedId}
          className="translation-reference-tab-input"
          type="radio"
          name={groupName}
          value="rendered"
          defaultChecked
        />
        <input
          id={markdownId}
          className="translation-reference-tab-input"
          type="radio"
          name={groupName}
          value="markdown"
        />
        <div className="translation-reference-tab-list" aria-label="Reference view">
          <label htmlFor={renderedId}>Rendered</label>
          <label htmlFor={markdownId}>Markdown</label>
        </div>
        <div className="translation-reference-view translation-reference-rendered">
          <MarkdownBlock html={html} />
        </div>
        <pre className="translation-reference-view translation-reference-markdown">{contentWithProofs(referenceMarkdown, { proofs })}</pre>
      </div>
    </aside>
  );
}
