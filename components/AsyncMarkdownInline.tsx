import { MarkdownInline } from "@/components/MarkdownInline";
import { renderInlineMarkdown } from "@/lib/markdown";

export async function AsyncMarkdownInline({
  markdown,
  className
}: {
  markdown: string;
  className?: string;
}) {
  const html = await renderInlineMarkdown(markdown);

  return <MarkdownInline html={html} className={className} />;
}
