import type { InterfaceLocale } from "@/lib/i18n/types";

export type HomePriorityCopy = {
  language: InterfaceLocale;
  title: string;
  body: string;
};

export const DEFAULT_HOME_PRIORITIES: Record<InterfaceLocale, HomePriorityCopy> = {
  en: {
    language: "en",
    title: "What we're working on",
    body:
      "We are currently reviewing linear algebra problem statements, making the solution editor easier to use, and preparing a monthly team contest for September. The site moves forward one small improvement at a time, and your feedback helps shape what comes next."
  },
  fr: {
    language: "fr",
    title: "Priorités du moment",
    body:
      "On relit en ce moment les énoncés d'algèbre linéaire, on rend l'éditeur de solutions plus supportable, et le concours mensuel en équipes arrive en septembre. Le site avance par petits coups de pioche — vos remarques orientent la suite."
  }
};

export function homePriorityForLocale(
  stored: { language: string; title: string; body: string } | null | undefined,
  locale: InterfaceLocale
): HomePriorityCopy {
  if (stored?.language === locale && stored.title.trim() && stored.body.trim()) {
    return { language: locale, title: stored.title, body: stored.body };
  }

  return DEFAULT_HOME_PRIORITIES[locale];
}
