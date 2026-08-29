import type { InterfaceLocale } from "./i18n/types.ts";

export const USER_REGISTRATION_SUMMARY_KEY = "recent-user-registrations";
export const USER_REGISTRATION_SUMMARY_HREF = "/users/recent";
export const USER_REGISTRATION_SUMMARY_WINDOW_HOURS = 24;
export const RECENT_USER_REGISTRATION_DAYS = 30;

export function userRegistrationSummaryCopy(locale: InterfaceLocale, count: number) {
  const safeCount = Math.max(0, Math.floor(count));

  if (locale === "fr") {
    if (safeCount === 1) {
      return {
        title: "Un nouveau membre",
        body: "Une personne a rejoint Math Woods au cours des dernières 24 heures."
      };
    }
    if (safeCount > 1) {
      return {
        title: `${safeCount} nouveaux membres`,
        body: `${safeCount} personnes ont rejoint Math Woods au cours des dernières 24 heures.`
      };
    }
    return {
      title: "Nouvelles inscriptions",
      body: "Des personnes ont récemment rejoint Math Woods."
    };
  }

  if (safeCount === 1) {
    return {
      title: "One new member",
      body: "One person joined Math Woods in the last 24 hours."
    };
  }
  if (safeCount > 1) {
    return {
      title: `${safeCount} new members`,
      body: `${safeCount} people joined Math Woods in the last 24 hours.`
    };
  }
  return {
    title: "New registrations",
    body: "People recently joined Math Woods."
  };
}
