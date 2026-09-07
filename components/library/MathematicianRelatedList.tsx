import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { renderMarkdown } from "@/lib/markdown";
import { RELATED_CATEGORIES, relatedCopy, type MathematicianRelatedView } from "@/lib/mathematician-related";

export async function MathematicianRelatedList({ items, locale }: { items: MathematicianRelatedView[]; locale: "fr" | "en" }) {
  return <>{await Promise.all(RELATED_CATEGORIES.map(async category => {
    const rows = items.filter(item => item.category === category && (item.labelMarkdown.trim() || item.noteMarkdown.trim()));
    if (!rows.length) return null;
    return <section key={category}><h2>{category === "LEGACY" ? (locale === "fr" ? "Références" : "References") : relatedCopy[locale][category].title}</h2><ol className="library-bibliography">{await Promise.all(rows.map(async item => <li id={`reference-${item.key}`} key={item.key} className="scroll-mt-24">
      {item.href ? <Link href={item.href as never}><AsyncMarkdownInline markdown={item.labelMarkdown} /></Link> : <AsyncMarkdownInline markdown={item.labelMarkdown} />}
      {item.relation && <small> — {item.relation === "EPONYM" ? (locale === "fr" ? "porte son nom" : "named after this person") : (locale === "fr" ? "contribution déterminante" : "crucial contribution")}</small>}
      {item.noteMarkdown && <details><summary>{locale === "fr" ? "Précisions" : "Details"}</summary><MarkdownBlock html={await renderMarkdown(item.noteMarkdown)} /></details>}
    </li>))}</ol></section>;
  }))}</>;
}
