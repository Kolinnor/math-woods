import { citationUrl, type ProblemCitation } from "./problem-citations.ts";

export type CitationImage = {
  url: string;
  size: number;
  alt: string;
  credit: string | null;
  creditUrl: string | null;
  license: string | null;
};

export type IllustratedCitation = ProblemCitation & { image?: CitationImage };

type ReferenceImageSource = {
  id: number;
  status: string;
  iconUrl: string | null;
  iconSize: number;
  imageAlt: string | null;
  imageCredit: string | null;
  imageCreditUrl: string | null;
  imageLicense: string | null;
};

function safeUrl(value: string | null) {
  try { return citationUrl(value); } catch { return null; }
}

// Only enrich citations already filtered for reader access. Media stays out of
// editable citation snapshots, history merges and bibliography exports.
export function withCitationImages(
  citations: ProblemCitation[],
  links: Array<{ reference: ReferenceImageSource | null }>
): IllustratedCitation[] {
  const references = new Map(links.flatMap(({ reference }) => reference ? [[reference.id, reference] as const] : []));
  return citations.map(citation => {
    const reference = citation.referenceId === null ? undefined : references.get(citation.referenceId);
    const url = reference?.status === "PUBLISHED" ? safeUrl(reference.iconUrl) : null;
    if (!reference || !url) return citation;
    return { ...citation, image: {
      url,
      size: Math.max(24, Math.min(56, Number.isFinite(reference.iconSize) ? reference.iconSize : 40)),
      alt: reference.imageAlt ?? "",
      credit: reference.imageCredit,
      creditUrl: safeUrl(reference.imageCreditUrl),
      license: reference.imageLicense
    } };
  });
}
