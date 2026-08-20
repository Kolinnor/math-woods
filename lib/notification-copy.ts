import { localizeAchievementNotification } from "@/lib/achievement-copy";
import type { InterfaceLocale } from "@/lib/i18n/types";

type LocalizableNotification = {
  type: string;
  title: string;
  body: string;
  siteImprovementReview?: {
    improvement: { title: string };
  } | null;
};

export function localizeNotification(notification: LocalizableNotification, locale: InterfaceLocale) {
  const localized = localizeAchievementNotification(notification, locale);
  if (notification.type !== "SITE_IMPROVEMENT_COMPLETED") return localized;

  const improvementTitle = notification.siteImprovementReview?.improvement.title;
  if (!improvementTitle) return localized;

  return locale === "fr"
    ? {
        title: "Votre suggestion a bien été prise en compte",
        body: `« ${improvementTitle} » est prête à être testée. Vérifiez que tout fonctionne comme prévu, puis confirmez lorsque vous êtes satisfait.`
      }
    : {
        title: "Your suggestion has been implemented",
        body: `"${improvementTitle}" is ready to test. Check that it works as expected, then confirm when you are satisfied.`
      };
}
