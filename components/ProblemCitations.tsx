import { citationText, citationUrl, type ProblemCitation } from "@/lib/problem-citations";

function LinkedText({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    const candidate = part.replace(/[.,;!?]+$/, "");
    try { const url = citationUrl(candidate); return <span key={index}><a href={url!} target="_blank" rel="noreferrer">{candidate}</a>{part.slice(candidate.length)}</span>; }
    catch { return part; }
  })}</>;
}

// Callers filter visibility on the server before passing data to client components.
export function ProblemCitations({ citations, isOriginal = false, locale = "fr", exportHref }: { citations: ProblemCitation[]; isOriginal?: boolean; locale?: "en" | "fr"; exportHref?: string }) {
  if (!citations.length && !isOriginal) return null;
  return <section className="problem-citations-reading" aria-label={locale === "fr" ? "Références" : "References"}>
    <h2>{locale === "fr" ? "Références" : "References"}</h2>
    {isOriginal && <p>{locale === "fr" ? "Problème original" : "Original problem"}</p>}
    <ol>{citations.map((citation) => {
      let url: string | null = null;
      try { url = citationUrl(citation.url); } catch { /* An incomplete draft URL stays plain text. */ }
      return <li key={citation.citationKey}>
      {url ? <a href={url} target="_blank" rel="noreferrer">{citationText(citation)}</a> : <span><LinkedText text={citationText(citation)} /></span>}
      {citation.note && <p><LinkedText text={citation.note} /></p>}
    </li>; })}</ol>
    {exportHref && citations.length > 0 && <details><summary>{locale === "fr" ? "Exporter les références" : "Export references"}</summary><div className="problem-citation-buttons"><a href={`${exportHref}?format=bibtex`} className="button secondary">BibTeX</a><a href={`${exportHref}?format=json`} className="button secondary">JSON</a></div></details>}
  </section>;
}
