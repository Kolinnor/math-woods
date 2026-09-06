import { JsxGraphMarkdown } from "@/components/JsxGraphMarkdown";
import { displayTypography } from "@/lib/display-typography";

export function MarkdownBlock({ html }: { html: string }) {
  return <JsxGraphMarkdown html={displayTypography(html)} />;
}
