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
    en: { ANCIENT: "Ancient", MEDIEVAL: "Medieval", EARLY_MODERN: "Early modern", MODERN: "Modern", CONTEMPORARY: "Contemporary" },
    fr: { ANCIENT: "Antiquité", MEDIEVAL: "Moyen Âge", EARLY_MODERN: "Époque moderne", MODERN: "XIXe et XXe siècles", CONTEMPORARY: "Contemporain" }
  } as const;
  return labels[locale][era];
}

export function milestoneTypeLabel(type: HistoryMilestoneType, locale: "en" | "fr") {
  const labels = {
    en: { DISCOVERY: "Discovery", PUBLICATION: "Publication", NOTATION: "Notation", INSTITUTION: "Institution", BIOGRAPHICAL: "Biography", OTHER: "Milestone" },
    fr: { DISCOVERY: "Découverte", PUBLICATION: "Publication", NOTATION: "Notation", INSTITUTION: "Institution", BIOGRAPHICAL: "Biographie", OTHER: "Repère" }
  } as const;
  return labels[locale][type];
}

export function normalizeReferenceDedupeKey(input: {
  doi?: string | null;
  isbn?: string | null;
  url?: string | null;
  title: string;
  authors?: string | null;
  year?: number | null;
}) {
  const doi = input.doi?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  if (doi) return `doi:${doi}`;
  const isbn = input.isbn?.replace(/[^0-9x]/gi, "").toLowerCase();
  if (isbn) return `isbn:${isbn}`;
  if (input.url) {
    try {
      const url = new URL(input.url);
      url.hash = "";
      return `url:${url.toString().replace(/\/$/, "").toLowerCase()}`;
    } catch {
      // Fall back to a title-based key; URL validation happens in the action.
    }
  }
  return `title:${[input.title, input.authors, input.year].filter(Boolean).join("|").trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function formatLibraryReference(reference: {
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
    reference.publisher,
    reference.yearLabel ?? reference.year?.toString()
  ].filter(Boolean).join(". ");
}
