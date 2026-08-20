import { SiteImprovementPriority, SiteImprovementStatus } from "@prisma/client";

export const SITE_IMPROVEMENT_STATUS_ORDER = [
  SiteImprovementStatus.BACKLOG,
  SiteImprovementStatus.PLANNED,
  SiteImprovementStatus.IN_PROGRESS,
  SiteImprovementStatus.COMPLETED
] as const;

export const SITE_IMPROVEMENT_PRIORITY_ORDER = [
  SiteImprovementPriority.HIGH,
  SiteImprovementPriority.NORMAL,
  SiteImprovementPriority.LOW
] as const;

export function parseSiteImprovementStatus(value: FormDataEntryValue | string | null | undefined) {
  const normalized = String(value ?? "");
  if (Object.values(SiteImprovementStatus).includes(normalized as SiteImprovementStatus)) {
    return normalized as SiteImprovementStatus;
  }
  throw new Error("Unknown site improvement status.");
}

export function parseSiteImprovementPriority(value: FormDataEntryValue | string | null | undefined) {
  const normalized = String(value ?? "");
  if (Object.values(SiteImprovementPriority).includes(normalized as SiteImprovementPriority)) {
    return normalized as SiteImprovementPriority;
  }
  throw new Error("Unknown site improvement priority.");
}

const copy = {
  en: {
    tabTasks: "Content tasks",
    tabImprovements: "Site improvements",
    title: "Site improvements",
    eyebrow: "Work to do",
    description: "Coordinate improvements to the site and discuss implementation decisions.",
    create: "Add an improvement",
    createTitle: "New improvement",
    titleLabel: "Short title",
    descriptionLabel: "What should change?",
    priorityLabel: "Priority",
    add: "Add to the board",
    discussion: "Discussion",
    comments: (count: number) => `${count} ${count === 1 ? "message" : "messages"}`,
    createdBy: "Created by",
    back: "Back to the board",
    changeStatus: "Status",
    changePriority: "Priority",
    addMessage: "Add to the discussion",
    publish: "Post",
    edit: "Edit title and description",
    save: "Save",
    noMessages: "No discussion yet.",
    noItems: "Nothing here yet.",
    formerUser: "former user",
    history: "History",
    statuses: {
      BACKLOG: "To consider",
      PLANNED: "Planned",
      IN_PROGRESS: "In progress",
      COMPLETED: "Completed"
    },
    priorities: { LOW: "Low", NORMAL: "Normal", HIGH: "High" },
    activity: {
      CREATED: "created this improvement",
      DETAILS_CHANGED: "updated the title or description",
      STATUS_CHANGED: "changed the status",
      PRIORITY_CHANGED: "changed the priority"
    }
  },
  fr: {
    tabTasks: "Tâches de contenu",
    tabImprovements: "Améliorations du site",
    title: "Améliorations du site",
    eyebrow: "Travail à faire",
    description: "Coordonnez les améliorations du site et discutez des choix d'implémentation.",
    create: "Ajouter une amélioration",
    createTitle: "Nouvelle amélioration",
    titleLabel: "Titre court",
    descriptionLabel: "Que faudrait-il changer ?",
    priorityLabel: "Priorité",
    add: "Ajouter au tableau",
    discussion: "Discussion",
    comments: (count: number) => `${count} message${count === 1 ? "" : "s"}`,
    createdBy: "Créée par",
    back: "Retour au tableau",
    changeStatus: "Statut",
    changePriority: "Priorité",
    addMessage: "Ajouter à la discussion",
    publish: "Publier",
    edit: "Modifier le titre et la description",
    save: "Enregistrer",
    noMessages: "Aucune discussion pour le moment.",
    noItems: "Rien ici pour le moment.",
    formerUser: "ancien utilisateur",
    history: "Historique",
    statuses: {
      BACKLOG: "À étudier",
      PLANNED: "Planifié",
      IN_PROGRESS: "En cours",
      COMPLETED: "Terminé"
    },
    priorities: { LOW: "Basse", NORMAL: "Normale", HIGH: "Haute" },
    activity: {
      CREATED: "a créé cette amélioration",
      DETAILS_CHANGED: "a modifié le titre ou la description",
      STATUS_CHANGED: "a changé le statut",
      PRIORITY_CHANGED: "a changé la priorité"
    }
  }
} as const;

export function siteImprovementCopy(locale: "en" | "fr") {
  return copy[locale];
}
