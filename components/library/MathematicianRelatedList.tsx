import Link from "next/link";
import { BookMarked, Bookmark, Feather, Puzzle, Sigma } from "lucide-react";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { renderMarkdown } from "@/lib/markdown";
import { RELATED_CATEGORIES, relatedCopy, type MathematicianRelatedView } from "@/lib/mathematician-related";

const ICONS = { WORK: Feather, SOURCE: BookMarked, CONCEPT: Sigma, PROBLEM: Puzzle, LEGACY: Bookmark } as const;

export async function MathematicianRelatedList({ items, locale }: { items: MathematicianRelatedView[]; locale: "fr" | "en" }) {
  return <>{await Promise.all(RELATED_CATEGORIES.map(async category => {
    const rows = items.filter(item => item.category === category && (item.labelMarkdown.trim() || item.noteMarkdown.trim()));
    if (!rows.length) return null;
    const Icon = ICONS[category];
    const title = category === "LEGACY" ? (locale === "fr" ? "Références" : "References") : relatedCopy[locale][category].title;
    return <section key={category} className="library-entry-section" data-category={category.toLowerCase()}>
      <h2><Icon size={18} aria-hidden="true" />{title}<span className="library-entry-section-count">{rows.length}</span></h2>
      <ol className="library-link-list">{await Promise.all(rows.map(async item => <li id={`reference-${item.key}`} key={item.key} className="library-link-item scroll-mt-24">
        <div>
          {item.href ? <Link className="library-link-title" href={item.href as never}><AsyncMarkdownInline markdown={item.labelMarkdown} /></Link> : <span className="library-link-title"><AsyncMarkdownInline markdown={item.labelMarkdown} /></span>}
          {item.relation && <small className="library-link-relation">{item.relation === "EPONYM" ? (locale === "fr" ? "porte son nom" : "named after this person") : (locale === "fr" ? "contribution déterminante" : "crucial contribution")}</small>}
          {item.noteMarkdown && <details className="library-link-note"><summary>{locale === "fr" ? "Précisions" : "Details"}</summary><MarkdownBlock html={await renderMarkdown(item.noteMarkdown)} /></details>}
        </div>
      </li>))}</ol>
    </section>;
  }))}</>;
}
