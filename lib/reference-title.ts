// Reject obvious bibliography fragments, without trying to judge whether an
// unfamiliar title is a real book, article, video or other resource.
const BIBTEX_ENTRY = /^\s*@\w+\s*[{(]/m;
const BIBTEX_FIELD = /^\s*(?:author|editor|title|booktitle|publisher|year|date|journal|journaltitle|volume|number|pages|edition|series|address|location|organization|institution|school|doi|isbn|issn|url|urldate|eprint|archiveprefix|primaryclass|note|annote|abstract|keywords|language|langid|crossref|xdata|translator)\s*=/im;

export function requireReadableReferenceTitle(title: string, locale: "fr" | "en" = "en") {
  if (!title.trim() || /^[\s{}(),]+$/.test(title) || BIBTEX_ENTRY.test(title) || BIBTEX_FIELD.test(title)) {
    throw new Error(locale === "fr"
      ? "Indiquez le titre de la ressource, pas un fragment BibTeX. Une entrée BibTeX doit être importée entière dans le champ prévu à cet effet."
      : "Enter the resource title, not a BibTeX fragment. Import the complete BibTeX entry in the dedicated field.");
  }
}
