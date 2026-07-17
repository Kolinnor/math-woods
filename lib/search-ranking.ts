export type SearchRankCandidate = {
  title: string;
  slug: string;
  aliases?: readonly string[];
  language?: string;
};

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsWholeWord(value: string, query: string) {
  return value.split(" ").includes(query);
}

export function searchMatchScore(candidate: SearchRankCandidate, rawQuery: string) {
  const query = normalizeSearchText(rawQuery);
  if (!query) return Number.POSITIVE_INFINITY;

  const title = normalizeSearchText(candidate.title);
  const slug = normalizeSearchText(candidate.slug);
  const aliases = (candidate.aliases ?? []).map(normalizeSearchText);

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
  return 10;
}

export function rankSearchMatches<T extends SearchRankCandidate>(
  candidates: readonly T[],
  query: string,
  preferredLanguage?: string
) {
  return [...candidates].sort((left, right) => {
    const scoreDifference = searchMatchScore(left, query) - searchMatchScore(right, query);
    if (scoreDifference) return scoreDifference;

    if (preferredLanguage) {
      const leftPreferred = left.language === preferredLanguage ? 0 : 1;
      const rightPreferred = right.language === preferredLanguage ? 0 : 1;
      if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    }

    const lengthDifference = normalizeSearchText(left.title).length - normalizeSearchText(right.title).length;
    if (lengthDifference) return lengthDifference;
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  });
}
