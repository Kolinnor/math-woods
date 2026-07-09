import { MarkdownBlock } from "@/components/MarkdownBlock";
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
  stale = false
}: TranslationReferencePanelProps) {
  const html = await renderMarkdownForContentLanguage(markdown, language);
  const renderedId = `${idPrefix}-rendered`;
  const markdownId = `${idPrefix}-markdown`;
  const groupName = `${idPrefix}-mode`;

  return (
    <aside className="translation-reference-panel">
      <div className="translation-reference-header">
        <div>
          <span>Original</span>
          <strong>{contentLanguageLabel(language)}</strong>
        </div>
        {href && (
          <a href={href} className="translation-reference-link">
            Open
          </a>
        )}
      </div>
      <h2>{title}</h2>
      {(stale || latestRevisionId || basedOnRevisionId) && (
        <p className={stale ? "translation-reference-status stale" : "translation-reference-status"}>
          {stale
            ? `Source changed after revision ${basedOnRevisionId ?? "unknown"}. Latest source revision: ${latestRevisionId}.`
            : latestRevisionId
              ? `Based on source revision ${basedOnRevisionId ?? latestRevisionId}.`
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
        <div className="translation-reference-tab-list" aria-label="Original view">
          <label htmlFor={renderedId}>Rendered</label>
          <label htmlFor={markdownId}>Markdown</label>
        </div>
        <div className="translation-reference-view translation-reference-rendered">
          <MarkdownBlock html={html} />
        </div>
        <pre className="translation-reference-view translation-reference-markdown">{markdown}</pre>
      </div>
    </aside>
  );
}
