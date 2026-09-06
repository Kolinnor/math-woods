import { displayTypography } from "@/lib/display-typography";

export function MarkdownInline({ html, className }: { html: string; className?: string }) {
  return (
    <span
      className={className ? `markdown-inline ${className}` : "markdown-inline"}
      dangerouslySetInnerHTML={{ __html: displayTypography(html) }}
    />
  );
}
