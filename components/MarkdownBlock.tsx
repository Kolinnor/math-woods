export function MarkdownBlock({ html }: { html: string }) {
  return <div className="prose-math max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
