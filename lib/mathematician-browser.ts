import { rankMathematicians } from "./mathematician-names.ts";

export const MIN_HISTORY_YEAR = -3500;
export const MATHEMATICIAN_SORTS = ["alphabetical", "oldest", "recent", "added", "updated"] as const;
export type MathematicianSort = typeof MATHEMATICIAN_SORTS[number];
export type BrowserQuery = Record<string, string | string[] | undefined>;
export const browserValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const values = (value: string | string[] | undefined) => Array.isArray(value) ? value : value ? [value] : [];
export function historyPresets(currentYear: number) {
  return [
    { value: "ancient", from: MIN_HISTORY_YEAR, to: 499, fr: "Antiquité (avant 500)", en: "Antiquity (before 500)" },
    { value: "medieval", from: 500, to: 1499, fr: "Moyen Âge (500–1499)", en: "Middle Ages (500–1499)" },
    { value: "early-modern", from: 1500, to: 1799, fr: "XVIe–XVIIIe siècles", en: "16th–18th centuries" },
    { value: "modern", from: 1800, to: 1949, fr: "1800–1949", en: "1800–1949" },
    { value: "contemporary", from: 1950, to: currentYear, fr: "Depuis 1950", en: "Since 1950" }
  ];
}
export function historyYearLabel(year: number, locale: "fr" | "en") {
  return year < 0 ? `${-year} ${locale === "fr" ? "av. J.-C." : "BCE"}` : String(year);
}
function yearNumber(value: unknown, currentYear: number) {
  const raw = String(value ?? "").trim();
  if (!/^-?\d{1,4}$/.test(raw)) return null;
  const year = Number(raw);
  return year !== 0 && year >= MIN_HISTORY_YEAR && year <= currentYear ? year : null;
}
export function parseMathematicianFilters(query: BrowserQuery, locale: "fr" | "en", currentYear: number) {
  const explicitLanguages = query.languagesSet !== undefined || query.language !== undefined;
  const languages = explicitLanguages ? [...new Set(values(query.language).filter(v => v === "fr" || v === "en"))] : [locale];
  const era = historyPresets(currentYear).find(preset => preset.value === browserValue(query.era));
  const from = yearNumber(browserValue(query.from), currentYear), to = yearNumber(browserValue(query.to), currentYear);
  const period = era ? { from: era.from, to: era.to } : from !== null || to !== null
    ? { from: Math.min(from ?? MIN_HISTORY_YEAR, to ?? currentYear), to: Math.max(from ?? MIN_HISTORY_YEAR, to ?? currentYear) } : null;
  const rawSort = browserValue(query.sort);
  const sort: MathematicianSort = MATHEMATICIAN_SORTS.includes(rawSort as MathematicianSort) ? rawSort as MathematicianSort : "alphabetical";
  return { q: browserValue(query.q)?.trim().slice(0, 160) ?? "", languages, era: era?.value ?? "", period, sort, review: browserValue(query.review) === "1", stub: browserValue(query.stub) === "1" };
}
export type MathematicianFilters = ReturnType<typeof parseMathematicianFilters>;

// Only recognize simple year ranges, a dated floruit, or an explicitly living person.
// Ambiguous dates are left unknown; no lifetime is invented from a single known year.
export function legacyMathematicianPeriod(lifespan: string, currentYear: number) {
  let value = lifespan.trim().toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
  const bce = /\b(?:bce?|avant|av\.)/.test(value);
  value = value.replace(/(?:avant|av\.)\s*j\.?\s*-?\s*c\.?|\b(?:bce?|ce|ad)\b/g, "").trim();
  value = value.replace(/^(?:vers|circa|ca\.?|c\.|fl\.?|floruit)\s*/, "");
  const living = value.match(/^(\d{1,4})\s*[–—-]\s*(?:present|aujourd'hui)?$/);
  if (living && !bce) {
    const start = yearNumber(living[1], currentYear);
    return start === null ? null : { from: start, to: currentYear };
  }
  value = value.replace(/^(?:ne(?:e)?(?: en)?|born)\s+/, "");
  const match = value.match(/^(-?\d{1,4})(?:\s*[–—-]\s*(-?\d{1,4}))?$/);
  if (!match) return null;
  const from = yearNumber(bce ? -Math.abs(Number(match[1])) : match[1], currentYear);
  const to = yearNumber(bce ? -Math.abs(Number(match[2] ?? match[1])) : match[2] ?? match[1], currentYear);
  if (from === null || to === null || from > to) return null;
  return { from, to };
}
export function mathematicianPeriod(person: { lifespan: string; periodStartYear?: number | null; periodEndYear?: number | null }, currentYear: number) {
  if (person.periodStartYear != null || person.periodEndYear != null) {
    const from = person.periodStartYear ?? person.periodEndYear!;
    const to = person.periodEndYear ?? person.periodStartYear!;
    return from <= to ? { from, to } : null;
  }
  return legacyMathematicianPeriod(person.lifespan, currentYear);
}
export function submittedMathematicianPeriod(form: FormData, locale: "fr" | "en", currentYear = new Date().getFullYear()) {
  if (!form.has("periodStartYear") && !form.has("periodEndYear")) return {};
  const parse = (field: string) => {
    const raw = String(form.get(field) ?? "").trim();
    if (!raw) return null;
    const value = yearNumber(raw, currentYear);
    if (value === null) throw new Error(locale === "fr" ? `Indiquez une année entre ${MIN_HISTORY_YEAR} et ${currentYear}, sans année zéro.` : `Enter a year between ${MIN_HISTORY_YEAR} and ${currentYear}, excluding year zero.`);
    return value;
  };
  const periodStartYear = parse("periodStartYear"), periodEndYear = parse("periodEndYear");
  if (periodStartYear !== null && periodEndYear !== null && periodStartYear > periodEndYear) throw new Error(locale === "fr" ? "La première année doit précéder la dernière." : "The first year must not follow the last year.");
  return { periodStartYear, periodEndYear };
}
export function isMathematicianStub(translation?: { biographyHtml?: string; contributionsHtml?: string } | null) {
  return ![translation?.biographyHtml, translation?.contributionsHtml].some(html => html?.replace(/<[^>]*>|&nbsp;|&#160;/g, "").trim());
}
export function defaultMathematicianSortName(name: string) {
  const parts = name.trim().split(/\s+/);
  // Locative/historical names and particles need an explicit key, not a guessed surname.
  if (parts.length < 2 || /\b(?:de|du|des|van|von|ibn|ben|al|le|la)\b|\bd['’]/i.test(name)) return name;
  return `${parts.at(-1)}, ${parts.slice(0, -1).join(" ")}`;
}
type BrowserPerson = {
  id: number; name: string; aliases: string[]; lifespan: string; periodStartYear?: number | null; periodEndYear?: number | null;
  status: string; needsReviewAfterEdit: boolean; createdAt: Date; updatedAt: Date;
  translations: { language: string; displayName: string; sortName?: string; teaser: string; biographyHtml: string; contributionsHtml: string }[];
};
export function filterMathematicians<T extends BrowserPerson>(people: T[], filters: MathematicianFilters, locale: "fr" | "en", currentYear: number) {
  const matches = rankMathematicians(people, filters.q, locale);
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const rows = matches.flatMap(person => {
    const translation = person.translations.find(t => t.language === locale && filters.languages.includes(t.language))
      ?? person.translations.find(t => filters.languages.some(language => language === t.language));
    if (!translation) return [];
    const period = mathematicianPeriod(person, currentYear);
    if (filters.period && (!period || period.from > filters.period.to || period.to < filters.period.from)) return [];
    const stub = isMathematicianStub(translation);
    const review = person.status === "PENDING_REVIEW" || (person.status === "PUBLISHED" && person.needsReviewAfterEdit);
    if ((filters.stub || filters.review) && !((filters.stub && stub) || (filters.review && review))) return [];
    return [{ person, translation, period, stub, review }];
  });
  if (filters.q && filters.sort === "alphabetical") return rows;
  return rows.sort((a, b) => {
    if (filters.sort === "oldest" || filters.sort === "recent") {
      if (!a.period || !b.period) { if (a.period !== b.period) return a.period ? -1 : 1; }
      else { const difference = (a.period.from - b.period.from) * (filters.sort === "oldest" ? 1 : -1); if (difference) return difference; }
    }
    if (filters.sort === "added" || filters.sort === "updated") {
      const field = filters.sort === "added" ? "createdAt" : "updatedAt";
      const difference = b.person[field].getTime() - a.person[field].getTime(); if (difference) return difference;
    }
    return collator.compare(a.translation.sortName || defaultMathematicianSortName(a.translation.displayName), b.translation.sortName || defaultMathematicianSortName(b.translation.displayName)) || a.person.id - b.person.id;
  });
}
export function mathematiciansHref(query: BrowserQuery) {
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(query)) for (const item of values(value)) if (item) params.append(key,item);
  return `/library/mathematicians${params.size ? `?${params}` : ""}`;
}

export function mathematiciansReturnHref(value?: unknown) {
  if (typeof value !== "string" || !value || value.length > 4000) return "/library/mathematicians";
  return value === "/library/mathematicians" || value.startsWith("/library/mathematicians?") ? value : "/library/mathematicians";
}
