import { ContentHistorySection } from "@/components/ContentHistorySection";
import { visibleHistory, type ContentHistory as HistoryFields } from "@/lib/content-history";
import { renderMarkdownForContentLanguage } from "@/lib/translated-markdown";

export async function ContentHistory({ content, locale }: { content: Partial<HistoryFields> & { language: string }; locale: string }) {
  if (!visibleHistory(content)) return null;
  const html = await renderMarkdownForContentLanguage(content.historyMarkdown!, content.language);
  return <ContentHistorySection html={html} spoiler={content.historySpoiler} locale={locale} />;
}
