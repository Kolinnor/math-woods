import { citationUrl, type ProblemCitation } from "@/lib/problem-citations";

function LinkedText({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    const candidate = part.replace(/[.,;!?]+$/, "");
    try { const url = citationUrl(candidate); return <span key={index}><a href={url!} target="_blank" rel="noreferrer">{candidate}</a>{part.slice(candidate.length)}</span>; }
    catch { return part; }
  })}</>;
}

function CitationTitle({ citation }: { citation: ProblemCitation }) {
  let url: string | null = null;
  try { url = citationUrl(citation.url); } catch { /* An incomplete draft URL stays plain text. */ }
  return url
    ? <a href={url} target="_blank" rel="noreferrer">{citation.text}</a>
    : <span><LinkedText text={citation.text} /></span>;
}

function CitationDetails({ citation }: { citation: ProblemCitation }) {
  if (!citation.locator && !citation.note) return null;
  return <div className="problem-citation-note">
    {citation.locator && <p><LinkedText text={citation.locator} /></p>}
    {citation.note && <p><LinkedText text={citation.note} /></p>}
  </div>;
}

// Callers filter visibility on the server before passing data to client components.
export function ProblemCitations({ citations, isOriginal = false, locale = "fr", exportHref }: { citations: ProblemCitation[]; isOriginal?: boolean; locale?: "en" | "fr"; exportHref?: string }) {
  if (!citations.length && !isOriginal) return null;
  const [first, ...others] = citations;
  const canExport = Boolean(exportHref && citations.length);
  const hasDetails = Boolean(others.length || first?.locator || first?.note || canExport);
  return <section className="problem-citations-reading" aria-label={locale === "fr" ? "Références" : "References"}>
    <h2>{locale === "fr" ? "Références" : "References"}</h2>
    {isOriginal && <p>{locale === "fr" ? "Problème original" : "Original problem"}</p>}
    {first && <ol><li><CitationTitle citation={first} /></li></ol>}
    {hasDetails && <details className="problem-citations-details">
      <summary>{locale === "fr" ? "Détails" : "Details"}</summary>
      {first && <CitationDetails citation={first} />}
      {others.length > 0 && <ol start={2}>{others.map(citation => <li key={citation.citationKey}>
        <CitationTitle citation={citation} />
        <CitationDetails citation={citation} />
      </li>)}</ol>}
      {canExport && <div className="problem-citations-export">
        <p>{locale === "fr" ? "Exporter les références" : "Export references"}</p>
        <div className="problem-citation-buttons">
          <a href={`${exportHref}?format=bibtex`} className="button secondary">BibTeX</a>
          <a href={`${exportHref}?format=json`} className="button secondary">JSON</a>
        </div>
      </div>}
    </details>}
  </section>;
}
