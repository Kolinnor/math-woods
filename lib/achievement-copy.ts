import type { InterfaceLocale } from "@/lib/i18n/types";

export const ACHIEVEMENTS = [
  {
    key: "a-place-in-the-woods",
    title: "A Place in the Woods",
    description: "Complete your profile bio."
  },
  {
    key: "first-clearing",
    title: "First Clearing",
    description: "Solve your first problem."
  },
  {
    key: "pathfinder",
    title: "Pathfinder",
    description: "Solve 10 problems."
  },
  {
    key: "ascending-the-mountain",
    title: "Ascending the Mountain",
    description: "Solve 100 problems."
  },
  {
    key: "lantern-bearer",
    title: "Lantern Bearer",
    description: "Add your first hint to a problem."
  },
  {
    key: "the-helpful-stranger",
    title: "The Helpful Stranger",
    description: "Receive 10 useful votes on hints or discussion posts."
  },
  {
    key: "proofsmith",
    title: "Solution Smith",
    description: "Publish your first solution."
  },
  {
    key: "cartographer",
    title: "Cartographer",
    description: "Create 10 concept pages."
  },
  {
    key: "trail-maker",
    title: "Trail Maker",
    description: "Have 5 of your contributed problems solved by other users."
  }
] as const;

export type AchievementKey = (typeof ACHIEVEMENTS)[number]["key"];

const frenchAchievementCopy: Record<AchievementKey, { title: string; description: string }> = {
  "a-place-in-the-woods": {
    title: "Une place dans les bois",
    description: "Complétez votre description de profil."
  },
  "first-clearing": {
    title: "Première clairière",
    description: "Résolvez votre premier problème."
  },
  pathfinder: {
    title: "Éclaireur",
    description: "Résolvez 10 problèmes."
  },
  "ascending-the-mountain": {
    title: "Gravir la montagne",
    description: "Résolvez 100 problèmes."
  },
  "lantern-bearer": {
    title: "Porte-lanterne",
    description: "Ajoutez votre premier indice à un problème."
  },
  "the-helpful-stranger": {
    title: "Main secourable",
    description: "Recevez 10 votes utiles sur vos indices ou messages de discussion."
  },
  proofsmith: {
    title: "Forgeron de solutions",
    description: "Publiez votre première solution."
  },
  cartographer: {
    title: "Cartographe",
    description: "Créez 10 pages de concept."
  },
  "trail-maker": {
    title: "Ouvreur de sentiers",
    description: "Faites résoudre par d’autres utilisateurs 5 problèmes auxquels vous avez contribué."
  }
};

export function achievementsForLocale(locale: InterfaceLocale) {
  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    ...(locale === "fr" ? frenchAchievementCopy[achievement.key] : {})
  }));
}

export function achievementUnlockedLabel(locale: InterfaceLocale) {
  return locale === "fr" ? "Succès débloqué" : "Achievement unlocked";
}

export function dismissAchievementLabel(locale: InterfaceLocale) {
  return locale === "fr" ? "Fermer le succès" : "Dismiss achievement";
}

export function localizeAchievementNotification(
  notification: { type: string; title: string; body: string },
  locale: InterfaceLocale
) {
  if (notification.type !== "ACHIEVEMENT_UNLOCKED") {
    return { title: notification.title, body: notification.body };
  }

  const achievement = ACHIEVEMENTS.find(
    (candidate) =>
      notification.body === `${candidate.title}: ${candidate.description}` ||
      notification.body.startsWith(`${candidate.title}:`)
  );
  if (!achievement) {
    return { title: achievementUnlockedLabel(locale), body: notification.body };
  }

  const localized = achievementsForLocale(locale).find((candidate) => candidate.key === achievement.key) ?? achievement;
  return {
    title: achievementUnlockedLabel(locale),
    body: locale === "fr"
      ? `${localized.title} : ${localized.description}`
      : `${localized.title}: ${localized.description}`
  };
}
