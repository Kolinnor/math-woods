import { MarkdownBlock } from "@/components/MarkdownBlock";
import { contentLanguageLabel } from "@/lib/languages";
import { renderMarkdown } from "@/lib/markdown";

type TranslationReferencePanelProps = {
  title: string;
  language: string;
  markdown: string;
};

export async function TranslationReferencePanel({ title, language, markdown }: TranslationReferencePanelProps) {
  const html = await renderMarkdown(markdown);

  return (
    <aside className="translation-reference-panel">
      <div className="translation-reference-header">
        <span>Original</span>
        <strong>{contentLanguageLabel(language)}</strong>
      </div>
      <h2>{title}</h2>
      <MarkdownBlock html={html} />
    </aside>
  );
}
