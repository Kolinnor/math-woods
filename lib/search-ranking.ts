export type SearchRankCandidate = {
  title: string;
  slug: string;
  aliases?: readonly string[];
  language?: string;
  searchText?: readonly (string | null | undefined)[];
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ENGLISH_SINGULARS: Record<string, string> = {
  analyses: "analysis",
  axes: "axis",
  bases: "basis",
  hypotheses: "hypothesis",
  indices: "index",
  matrices: "matrix",
  parentheses: "parenthesis",
  theses: "thesis",
  vertices: "vertex"
};

const ENGLISH_INVARIANT_PLURALS = new Set([
  "analysis",
  "basis",
  "bias",
  "calculus",
  "chaos",
  "gas",
  "lens",
  "mathematics",
  "plus",
  "series",
  "species",
  "topology"
]);

const FRENCH_SINGULARS: Record<string, string> = {
  anneaux: "anneau",
  chevaux: "cheval",
  noyaux: "noyau",
  travaux: "travail"
};

const FRENCH_INVARIANT_PLURALS = new Set(["cas", "corps", "fois", "plus", "sens", "souris", "temps", "univers"]);

function singularizeEnglishWord(word: string) {
  if (ENGLISH_SINGULARS[word]) return ENGLISH_SINGULARS[word];
  if (ENGLISH_INVARIANT_PLURALS.has(word)) return word;
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(sses|shes|ches|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function singularizeFrenchWord(word: string) {
  if (FRENCH_SINGULARS[word]) return FRENCH_SINGULARS[word];
  if (FRENCH_INVARIANT_PLURALS.has(word)) return word;
  if (word.length > 4 && word.endsWith("eaux")) return word.slice(0, -1);
  if (word.length > 4 && word.endsWith("aux")) return `${word.slice(0, -3)}al`;
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

export function searchMorphologyVariants(rawQuery: string, language: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return [];

  const singularizeWord =
    language === "en" ? singularizeEnglishWord : language === "fr" ? singularizeFrenchWord : null;
  if (!singularizeWord) return [query];

  const singular = query
    .split(" ")
    .map((word) => singularizeWord(word))
    .join(" ");

  return singular === query ? [query] : [query, singular];
}

function containsWholeWord(value: string, query: string) {
  return ` ${value} `.includes(` ${query} `);
}

function directSearchMatchScore(candidate: SearchRankCandidate, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return Number.POSITIVE_INFINITY;

  const title = normalizeSearchText(candidate.title);
  const slug = normalizeSearchText(candidate.slug);
  const aliases = (candidate.aliases ?? []).map(normalizeSearchText);
  const searchText = (candidate.searchText ?? []).map((value) => normalizeSearchText(value ?? ""));

  if (title === query) return 0;
  if (aliases.includes(query)) return 1;
  if (slug === query) return 2;
  if (title.startsWith(query)) return 3;
  if (aliases.some((alias) => alias.startsWith(query))) return 4;
  if (containsWholeWord(title, query)) return 5;
  if (slug.startsWith(query)) return 6;
  if (title.includes(query)) return 7;
  if (aliases.some((alias) => alias.includes(query))) return 8;
  if (slug.includes(query)) return 9;
  if (searchText.some((value) => value === query)) return 10;
  if (searchText.some((value) => value.startsWith(query))) return 11;
  if (searchText.some((value) => containsWholeWord(value, query))) return 12;
  if (searchText.some((value) => value.includes(query))) return 13;
  return 14;
}

export function searchMatchScore(
  candidate: SearchRankCandidate,
  rawQuery: string,
  morphologyVariants: readonly string[] = []
) {
  const directScore = directSearchMatchScore(candidate, rawQuery);
  const normalizedQuery = normalizeSearchText(rawQuery);
  const morphologyScore = morphologyVariants
    .filter((variant) => normalizeSearchText(variant) !== normalizedQuery)
    .reduce(
      (bestScore, variant) => Math.min(bestScore, directSearchMatchScore(candidate, variant) + 3),
      Number.POSITIVE_INFINITY
    );

  return Math.min(directScore, morphologyScore);
}

export function rankSearchMatches<T extends SearchRankCandidate>(
  candidates: readonly T[],
  query: string,
  preferredLanguage?: string,
  morphologyVariants: readonly string[] = [],
  tieBreaker?: (left: T, right: T) => number
) {
  return [...candidates].sort((left, right) => {
    const scoreDifference =
      searchMatchScore(left, query, morphologyVariants) - searchMatchScore(right, query, morphologyVariants);
    if (scoreDifference) return scoreDifference;

    if (preferredLanguage) {
      const leftPreferred = left.language === preferredLanguage ? 0 : 1;
      const rightPreferred = right.language === preferredLanguage ? 0 : 1;
      if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    }

    const tieDifference = tieBreaker?.(left, right) ?? 0;
    if (tieDifference) return tieDifference;

    const lengthDifference = normalizeSearchText(left.title).length - normalizeSearchText(right.title).length;
    if (lengthDifference) return lengthDifference;
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}
