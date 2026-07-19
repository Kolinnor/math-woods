import { JsxGraphMarkdown } from "@/components/JsxGraphMarkdown";

export function MarkdownBlock({ html }: { html: string }) {
  return <JsxGraphMarkdown html={html} />;
}
