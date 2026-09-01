import type { InterfaceLocale } from "./i18n/types.ts";

export type StoredConceptContributorGuide = {
  language: string;
  title: string;
  description: string;
  bodyMarkdown: string;
};

export function canUseStoredConceptContributorGuide(
  stored: StoredConceptContributorGuide | null | undefined,
  locale: InterfaceLocale
) {
  return Boolean(
    stored?.language === locale
    && stored.title.trim()
    && stored.description.trim()
    && stored.bodyMarkdown.trim()
  );
}
