// Small presentation helpers shared by the library pages (no database access).
import type { CSSProperties } from "react";

/** An era of the library, as stored in LibraryEra, with the end year deduced from the next era. */
export type LibraryEraView = {
  slug: string;
  startYear: number;
  /** Last year of the era: the year before the next era starts, or the current year. */
  endYear: number;
  color: string;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
};

export type LibraryEraRecord = {
  slug: string;
  startYear: number;
  color: string;
  nameFr: string;
  nameEn: string;
  descriptionFr?: string;
  descriptionEn?: string;
};

/** Used when the LibraryEra table is empty; same values as the migration that creates it. */
export const DEFAULT_LIBRARY_ERAS: LibraryEraRecord[] = [
  { slug: "premieres-civilisations", startYear: -3500, color: "#8a5a1c", nameFr: "Premières civilisations", nameEn: "Early civilisations", descriptionFr: "Mésopotamie, Égypte, Chine et Inde : numération, calcul et premières tables.", descriptionEn: "Mesopotamia, Egypt, China and India: numeration, computation and the first tables." },
  { slug: "mathematiques-grecques", startYear: -600, color: "#35658a", nameFr: "Mathématiques grecques", nameEn: "Greek mathematics", descriptionFr: "De Thalès à Hypatie : la démonstration devient la règle.", descriptionEn: "From Thales to Hypatia: proof becomes the rule." },
  { slug: "age-des-transmissions", startYear: 500, color: "#9a4526", nameFr: "Âge des transmissions", nameEn: "Age of transmission", descriptionFr: "Le zéro, l’algèbre et les chiffres indo-arabes voyagent de l’Inde à Bagdad, puis jusqu’à l’Europe.", descriptionEn: "Zero, algebra and Hindu–Arabic numerals travel from India to Baghdad, then on to Europe." },
  { slug: "renaissance-revolution-scientifique", startYear: 1400, color: "#2e6242", nameFr: "Renaissance et révolution scientifique", nameEn: "Renaissance and scientific revolution", descriptionFr: "Équations cubiques, notation symbolique, géométrie analytique et calcul infinitésimal.", descriptionEn: "Cubic equations, symbolic notation, analytic geometry and calculus." },
  { slug: "siecle-des-lumieres", startYear: 1700, color: "#8a3d62", nameFr: "Siècle des Lumières", nameEn: "Age of Enlightenment", descriptionFr: "Euler, Lagrange et les académies : l’analyse conquiert la mécanique et l’astronomie.", descriptionEn: "Euler, Lagrange and the academies: analysis conquers mechanics and astronomy." },
  { slug: "rigueur-abstraction", startYear: 1800, color: "#3f4e70", nameFr: "Rigueur et abstraction", nameEn: "Rigour and abstraction", descriptionFr: "Gauss, Galois, Riemann, Cantor : fondements rigoureux et nouvelles structures.", descriptionEn: "Gauss, Galois, Riemann, Cantor: rigorous foundations and new structures." },
  { slug: "mathematiques-contemporaines", startYear: 1900, color: "#5d4a80", nameFr: "Mathématiques contemporaines", nameEn: "Contemporary mathematics", descriptionFr: "Des problèmes de Hilbert aux ordinateurs : axiomatique, logique et spécialisation.", descriptionEn: "From Hilbert’s problems to computers: axioms, logic and specialisation." }
];

/** Sorts the eras and deduces where each one ends (there is no year zero). */
export function resolveLibraryEras(records: LibraryEraRecord[], currentYear: number): LibraryEraView[] {
  const sorted = [...records].sort((a, b) => a.startYear - b.startYear);
  return sorted.map((era, index) => {
    const next = sorted[index + 1];
    const end = next ? (next.startYear === 1 ? -1 : next.startYear - 1) : Math.max(currentYear, era.startYear);
    return {
      slug: era.slug,
      startYear: era.startYear,
      endYear: end,
      color: era.color,
      name: { fr: era.nameFr, en: era.nameEn },
      description: { fr: era.descriptionFr ?? "", en: era.descriptionEn ?? "" }
    };
  });
}

/** The era containing a year; years before the first era belong to it. */
export function libraryEraOfYear(eras: LibraryEraView[], year: number) {
  let found = eras[0] ?? null;
  for (const era of eras) if (year >= era.startYear) found = era;
  return found;
}

/** A person or a period belongs to the era of its middle (or of its only known year). */
export function libraryEraOfPeriod(eras: LibraryEraView[], start: number | null | undefined, end: number | null | undefined) {
  if (start == null && end == null) return null;
  if (start != null && end != null) return libraryEraOfYear(eras, Math.round((start + end) / 2));
  return libraryEraOfYear(eras, (start ?? end) as number);
}

export function libraryEraBySlug(eras: LibraryEraView[], slug: unknown) {
  return typeof slug === "string" ? eras.find(era => era.slug === slug) ?? null : null;
}

/** CSS variables used by monograms, chips and timelines: the era colour and a pale tint of it. */
export function libraryEraStyle(era: { color: string } | null | undefined): CSSProperties | undefined {
  if (!era) return undefined;
  return { "--era-ink": era.color, "--era-tint": `color-mix(in srgb, ${era.color} 15%, #fbf7ee)` } as CSSProperties;
}

export function libraryYearLabel(year: number, locale: "fr" | "en") {
  if (year >= 0) return String(year);
  return locale === "fr" ? `${-year} av. J.‑C.` : `${-year} BCE`;
}

export function libraryEraRange(era: LibraryEraView, locale: "fr" | "en", isLast: boolean) {
  if (isLast) return locale === "fr" ? `depuis ${libraryYearLabel(era.startYear, locale)}` : `since ${libraryYearLabel(era.startYear, locale)}`;
  return `${libraryYearLabel(era.startYear, locale)} – ${libraryYearLabel(era.endYear, locale)}`;
}

const PARTICLES = new Set(["de", "du", "des", "d", "van", "von", "der", "den", "ibn", "ben", "bin", "al", "le", "la", "of", "y"]);

/** One or two capital letters for a monogram: "Évariste Galois" → "ÉG", "Al-Khwarizmi" → "K". */
export function libraryInitials(name: string) {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s–—]+/)
    .map((word) => word.replace(/^(?:al|el|d|l)['’-]/i, "").replace(/[^\p{L}]/gu, ""))
    .filter((word) => word && !PARTICLES.has(word.toLowerCase()));
  if (!words.length) return name.trim().slice(0, 1).toUpperCase() || "?";
  const letters = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return letters.map((word) => word.slice(0, 1).toLocaleUpperCase("fr")).join("");
}

export function libraryPlural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Keeps "av. J.-C." or "BCE" with its year, so that narrow date columns only wrap between words. */
export function libraryDateLabel(label: string) {
  return label
    .replace(/\s+(av\.|apr\.)\s*J\.-C\./g, " $1 J.‑C.")
    .replace(/\s+(BCE|CE|BC|AD)\b/g, " $1");
}
