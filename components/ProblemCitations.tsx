import { citationUrl, type ProblemCitation } from "@/lib/problem-citations";
import type { IllustratedCitation } from "@/lib/citation-images";
import { ImageCredit } from "@/components/library/ImageCredit";

function LinkedText({ text }: { text: string }) {
  return <>{text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    const candidate = part.replace(/[.,;!?]+$/, "");
    try { const url = citationUrl(candidate); return <span key={index}><a href={url!} target="_blank" rel="noreferrer">{candidate}</a>{part.slice(candidate.length)}</span>; }
    catch { return part; }
  })}</>;
}

function CitationTitle({ citation, locale }: { citation: IllustratedCitation; locale: "fr" | "en" }) {
  let url: string | null = null;
  try { url = citationUrl(citation.url); } catch { /* An incomplete draft URL stays plain text. */ }
  const title = url
    ? <a href={url} target="_blank" rel="noreferrer">{citation.text}</a>
    : <span><LinkedText text={citation.text} /></span>;
  return <div className="problem-citation-title">
    {citation.image && <div className="problem-citation-image">
      <img src={citation.image.url} alt={citation.image.alt} width={citation.image.size} height={citation.image.size} loading="lazy" />
      <ImageCredit credit={citation.image.credit} creditUrl={citation.image.creditUrl} license={citation.image.license} label={locale === "fr" ? "Crédits de l’image" : "Image credits"} />
    </div>}
    <span>{title}</span>
  </div>;
}

function CitationDetails({ citation }: { citation: ProblemCitation }) {
  if (!citation.locator && !citation.note) return null;
  return <div className="problem-citation-note">
    {citation.locator && <p><LinkedText text={citation.locator} /></p>}
    {citation.note && <p><LinkedText text={citation.note} /></p>}
  </div>;
}

// Callers filter visibility on the server before passing data to client components.
export function ProblemCitations({ citations, isOriginal = false, locale = "fr", exportHref }: { citations: IllustratedCitation[]; isOriginal?: boolean; locale?: "en" | "fr"; exportHref?: string }) {
  if (!citations.length && !isOriginal) return null;
  const [first, ...others] = citations;
  const canExport = Boolean(exportHref && citations.length);
  const hasDetails = Boolean(others.length || first?.locator || first?.note || canExport);
  return <section className="problem-citations-reading" aria-label={locale === "fr" ? "Références" : "References"}>
    <h2>{locale === "fr" ? "Références" : "References"}</h2>
    {isOriginal && <p>{locale === "fr" ? "Problème original" : "Original problem"}</p>}
    {first && <ol><li><CitationTitle citation={first} locale={locale} /></li></ol>}
    {hasDetails && <details className="problem-citations-details">
      <summary>{locale === "fr" ? "Détails" : "Details"}</summary>
      {first && <CitationDetails citation={first} />}
      {others.length > 0 && <ol start={2}>{others.map(citation => <li key={citation.citationKey}>
        <CitationTitle citation={citation} locale={locale} />
        <CitationDetails citation={citation} />
      </li>)}</ol>}
      {canExport && <p className="problem-citations-export">
        <span>{locale === "fr" ? "Télécharger :" : "Download:"}</span>{" "}
        <a href={`${exportHref}?format=bibtex`} aria-label={locale === "fr" ? "Télécharger les références au format BibTeX" : "Download references as BibTeX"}>BibTeX</a>
        <span aria-hidden="true"> · </span>
        <a href={`${exportHref}?format=json`} aria-label={locale === "fr" ? "Télécharger les références au format JSON" : "Download references as JSON"}>JSON</a>
      </p>}
    </details>}
  </section>;
}
