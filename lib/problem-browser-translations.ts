type ProblemBrowserTranslation = {
  language: string;
  translatedFromProblemId: number | null;
};

function languagePreferenceRank(language: string, preferredLanguage: string, selectedLanguages: readonly string[]) {
  if (language === preferredLanguage) return 0;
  const selectedIndex = selectedLanguages.indexOf(language);
  return selectedIndex >= 0 ? selectedIndex + 1 : selectedLanguages.length + 1;
}

export function selectProblemBrowserTranslation<T extends ProblemBrowserTranslation>(
  translations: readonly T[],
  preferredLanguage: string,
  selectedLanguages: readonly string[]
) {
  return [...translations].sort((left, right) => {
    const languageRank =
      languagePreferenceRank(left.language, preferredLanguage, selectedLanguages) -
      languagePreferenceRank(right.language, preferredLanguage, selectedLanguages);
    if (languageRank !== 0) return languageRank;
    if (left.translatedFromProblemId === null && right.translatedFromProblemId !== null) return -1;
    if (left.translatedFromProblemId !== null && right.translatedFromProblemId === null) return 1;
    return 0;
  })[0] ?? null;
}
