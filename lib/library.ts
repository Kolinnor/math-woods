import {
  HistoryEra,
  HistoryMilestoneType,
  LibraryReferenceRole,
  LibraryReferenceType,
  LibraryStatus
} from "@prisma/client";

export const LIBRARY_LANGUAGES = ["en", "fr"] as const;

export function libraryPage(rawPage: string | undefined, total: number, pageSize: number) {
  const requested = Number(rawPage);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), totalPages) : 1;
  return { page, totalPages, skip: (page - 1) * pageSize, take: pageSize };
}

export function libraryLanguage(value: unknown) {
  return String(value ?? "").toLowerCase() === "fr" ? "fr" : "en";
}

export function libraryStatusLabel(status: LibraryStatus, locale: "en" | "fr") {
  const labels = {
    en: { DRAFT: "Draft", PENDING_REVIEW: "Awaiting review", PUBLISHED: "Published", NEEDS_WORK: "Needs work", ARCHIVED: "Archived" },
    fr: { DRAFT: "Brouillon", PENDING_REVIEW: "À relire", PUBLISHED: "Publié", NEEDS_WORK: "À retravailler", ARCHIVED: "Archivé" }
  } as const;
  return labels[locale][status];
}

export function referenceTypeLabel(type: LibraryReferenceType, locale: "en" | "fr") {
  const labels = {
    en: { BOOK: "Book", ARTICLE: "Article", LECTURE_NOTES: "Lecture notes", THESIS: "Thesis", VIDEO: "Video", CHANNEL: "Channel", WEBSITE: "Website", COMPETITION: "Competition", DATABASE: "Database", OTHER: "Other" },
    fr: { BOOK: "Livre", ARTICLE: "Article", LECTURE_NOTES: "Notes de cours", THESIS: "Thèse", VIDEO: "Vidéo", CHANNEL: "Chaîne", WEBSITE: "Site web", COMPETITION: "Concours", DATABASE: "Base de données", OTHER: "Autre" }
  } as const;
  return labels[locale][type];
}

export function referenceRoleLabel(role: LibraryReferenceRole, locale: "en" | "fr") {
  const labels = {
    en: { SOURCE: "Source", FURTHER_READING: "Further reading", PROOF: "Proof", ATTRIBUTION: "Attribution" },
    fr: { SOURCE: "Source", FURTHER_READING: "Pour aller plus loin", PROOF: "Démonstration", ATTRIBUTION: "Crédit" }
  } as const;
  return labels[locale][role];
}

export function historyEraLabel(era: HistoryEra, locale: "en" | "fr") {
  const labels = {
    en: { ANCIENT: "Antiquity (before 500)", MEDIEVAL: "Middle Ages (500–1499)", EARLY_MODERN: "16th–18th centuries", MODERN: "1800–1949", CONTEMPORARY: "Since 1950" },
    fr: { ANCIENT: "Antiquité (avant 500)", MEDIEVAL: "Moyen Âge (500–1499)", EARLY_MODERN: "XVIe–XVIIIe siècles", MODERN: "1800–1949", CONTEMPORARY: "Depuis 1950" }
  } as const;
  return labels[locale][era];
}

export function milestoneTypeLabel(type: HistoryMilestoneType, locale: "en" | "fr") {
  const labels = {
    en: { PERIOD: "Historical period", DISCOVERY: "Discovery", PUBLICATION: "Publication", NOTATION: "Notation", INSTITUTION: "Institution", BIOGRAPHICAL: "Biography", OTHER: "Milestone" },
    fr: { PERIOD: "Période historique", DISCOVERY: "Découverte", PUBLICATION: "Publication", NOTATION: "Notation", INSTITUTION: "Institution", BIOGRAPHICAL: "Biographie", OTHER: "Repère" }
  } as const;
  return labels[locale][type];
}

export function normalizeReferenceDedupeKey(input: {
  edition?: string | null;
  volume?: string | null;
  translator?: string | null;
  doi?: string | null;
  isbn?: string | null;
  url?: string | null;
  title: string;
  authors?: string | null;
  year?: number | null;
}) {
  const editionSuffix = [input.edition, input.volume, input.translator].some(Boolean)
    ? `|edition:${[input.edition, input.volume, input.translator].map((value) => value?.trim().toLowerCase() ?? "").join("|")}` : "";
  const doi = input.doi?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  if (doi) return `doi:${doi}`;
  const isbn = input.isbn?.replace(/[^0-9x]/gi, "").toLowerCase();
  if (isbn) return `isbn:${isbn}`;
  if (input.url) {
    try {
      const url = new URL(input.url);
      url.hash = "";
      return `url:${url.toString().replace(/\/$/, "").toLowerCase()}${editionSuffix}`;
    } catch {
      // Fall back to a title-based key; URL validation happens in the action.
    }
  }
  return `title:${[input.title, input.authors, input.year].filter(Boolean).join("|").trim().toLowerCase().replace(/\s+/g, " ")}${editionSuffix}`;
}

export function formatLibraryReference(reference: {
  edition?: string | null;
  volume?: string | null;
  translator?: string | null;
  journal?: string | null;
  issue?: string | null;
  pages?: string | null;
  canonicalTitle: string;
  authors: string | null;
  publisher: string | null;
  year: number | null;
  yearLabel: string | null;
  formattedOverride: string | null;
}) {
  if (reference.formattedOverride?.trim()) return reference.formattedOverride.trim();
  return [
    reference.authors,
    reference.canonicalTitle,
    reference.edition,
    reference.volume ? `vol. ${reference.volume}` : null,
    reference.translator ? `trad. ${reference.translator}` : null,
    reference.journal,
    reference.issue ? `n° ${reference.issue}` : null,
    reference.pages ? `p. ${reference.pages}` : null,
    reference.publisher,
    reference.yearLabel ?? reference.year?.toString()
  ].filter(Boolean).join(". ");
}
