import { NotificationType } from "@prisma/client";
import { localizeAchievementNotification } from "./achievement-copy.ts";
import type { InterfaceLocale } from "./i18n/types.ts";

type LocalizableNotification = {
  type: NotificationType;
  title: string;
  body: string;
  actor?: {
    username: string;
    displayName?: string | null;
  } | null;
  siteImprovementReview?: {
    improvement: { title: string };
  } | null;
};

type LocalizedNotification = { title: string; body: string };

const PROBLEM_FIELD_LABELS_FR: Record<string, string> = {
  title: "titre",
  language: "langue",
  statement: "énoncé",
  difficulty: "difficulté",
  domains: "domaines",
  origin: "origine",
  "origin chapter": "chapitre d’origine",
  "origin page": "page d’origine",
  "origin note": "note sur l’origine",
  visibility: "visibilité",
  "content type": "type de contenu",
  "conjecture status": "statut de conjecture",
  "problem styles": "styles du problème",
  "related-problems visibility": "visibilité des problèmes liés",
  "front page eligibility": "présence possible sur la page d’accueil",
  "publication status": "statut de publication",
  quality: "qualité",
  "verification mode": "mode de vérification",
  "verification prompt": "consigne de vérification",
  "verification answer": "réponse de vérification",
  "translation freshness": "actualité de la traduction",
  tags: "étiquettes",
  "spoiler tags": "étiquettes masquées",
  "related problems": "problèmes liés"
};

const STATUS_LABELS_FR: Record<string, string> = {
  draft: "brouillon",
  published: "publié",
  archived: "archivé",
  stub: "ébauche",
  reviewed: "relu",
  unreviewed: "non relu"
};

const REPORT_CATEGORY_FR: Record<string, string> = {
  "mathematical error": "une erreur mathématique",
  "incomplete argument": "un argument incomplet",
  "unclear explanation": "une explication peu claire",
  "irrelevant or inappropriate content": "du contenu hors sujet ou inapproprié",
  "other issue": "un autre problème"
};

function actorName(notification: LocalizableNotification) {
  return notification.actor?.displayName?.trim() || notification.actor?.username || null;
}

function textBefore(body: string, marker: string) {
  const index = body.indexOf(marker);
  return index > 0 ? body.slice(0, index).trim() : null;
}

function notificationActor(notification: LocalizableNotification, marker: string) {
  return actorName(notification) ?? textBefore(notification.body, marker) ?? "Quelqu’un";
}

function quotedValues(value: string) {
  return [...value.matchAll(/"([^"\r\n]+)"/g)].map((match) => match[1]);
}

function firstQuoted(value: string) {
  return quotedValues(value)[0] ?? null;
}

function trailingTextAfterQuotedSentence(value: string) {
  const boundary = value.indexOf('".');
  return boundary >= 0 ? value.slice(boundary + 2).trim() : "";
}

function translatedProblemFields(value: string) {
  return value
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)
    .map((field) => PROBLEM_FIELD_LABELS_FR[field.toLowerCase()] ?? field)
    .join(", ");
}

function translateEnglishDateWords(value: string) {
  const replacements: Record<string, string> = {
    Monday: "lundi",
    Tuesday: "mardi",
    Wednesday: "mercredi",
    Thursday: "jeudi",
    Friday: "vendredi",
    Saturday: "samedi",
    Sunday: "dimanche",
    January: "janvier",
    February: "février",
    March: "mars",
    April: "avril",
    May: "mai",
    June: "juin",
    July: "juillet",
    August: "août",
    September: "septembre",
    October: "octobre",
    November: "novembre",
    December: "décembre"
  };

  return Object.entries(replacements).reduce(
    (translated, [english, french]) => translated.replace(new RegExp(`\\b${english}\\b`, "g"), french),
    value
  );
}

function localizedProblemEdit(notification: LocalizableNotification): LocalizedNotification {
  const actor = notificationActor(notification, " edited ");
  const problemTitle = firstQuoted(notification.body);
  if (!problemTitle) return { title: "Problème modifié", body: notification.body };

  const tail = trailingTextAfterQuotedSentence(notification.body);
  const changedMatch = tail.match(/(?:^|\s)Changed: (.*?)(?:\. Summary: |\.$)/);
  const summaryMarker = tail.indexOf("Summary: ");
  const summary = summaryMarker >= 0 ? tail.slice(summaryMarker + "Summary: ".length).replace(/\.$/, "") : "";
  const details = [
    changedMatch?.[1] ? `Champs modifiés : ${translatedProblemFields(changedMatch[1])}.` : "",
    summary ? `Résumé : ${summary}.` : ""
  ].filter(Boolean);

  return {
    title: "Problème modifié",
    body: `${actor} a modifié « ${problemTitle} ».${details.length ? ` ${details.join(" ")}` : ""}`
  };
}

function localizedConceptEdit(notification: LocalizableNotification): LocalizedNotification {
  const conceptTitle = firstQuoted(notification.body);
  if (!conceptTitle) return { title: "Concept modifié", body: notification.body };

  if (notification.body.includes(" rolled back ")) {
    const actor = notificationActor(notification, " rolled back ");
    return { title: "Concept modifié", body: `${actor} a restauré une ancienne version de « ${conceptTitle} ».` };
  }

  const statusMatch = notification.body.match(/ changed "[\s\S]+" from ([a-z_]+) to ([a-z_]+)\.$/i);
  if (statusMatch) {
    const actor = notificationActor(notification, " changed ");
    const before = STATUS_LABELS_FR[statusMatch[1].toLowerCase()] ?? statusMatch[1].toLowerCase();
    const after = STATUS_LABELS_FR[statusMatch[2].toLowerCase()] ?? statusMatch[2].toLowerCase();
    return {
      title: "Statut du concept modifié",
      body: `${actor} a fait passer « ${conceptTitle} » du statut ${before} au statut ${after}.`
    };
  }

  const actor = notificationActor(notification, " edited ");
  return { title: "Concept modifié", body: `${actor} a modifié « ${conceptTitle} ».` };
}

function localizedSolutionReport(notification: LocalizableNotification): LocalizedNotification {
  const problemTitle = firstQuoted(notification.body);

  if (notification.title === "Potential issue reported on your solution") {
    const actor = notificationActor(notification, " reported a ");
    const category = notification.body.match(/ reported a (.*?) on your solution/)?.[1] ?? "other issue";
    const localizedCategory = REPORT_CATEGORY_FR[category] ?? `un problème de type « ${category} »`;
    return {
      title: "Un problème potentiel a été signalé dans votre solution",
      body: problemTitle
        ? `${actor} a signalé ${localizedCategory} dans votre solution à « ${problemTitle} ».`
        : `${actor} a signalé ${localizedCategory} dans votre solution.`
    };
  }

  const actor = notificationActor(notification, notification.body.includes(" marked ") ? " marked " : " reviewed ");
  if (notification.title === "Your solution report was addressed") {
    return {
      title: "Votre signalement a été pris en compte",
      body: problemTitle
        ? `${actor} a marqué votre signalement concernant « ${problemTitle} » comme traité.`
        : `${actor} a marqué votre signalement comme traité.`
    };
  }

  return {
    title: "Votre signalement a été examiné",
    body: problemTitle
      ? `${actor} a examiné puis classé votre signalement concernant « ${problemTitle} ».`
      : `${actor} a examiné puis classé votre signalement.`
  };
}

function localizedProblemDelivery(
  notification: LocalizableNotification,
  intent: "challenge" | "share"
): LocalizedNotification {
  const marker = intent === "challenge" ? " challenged you to solve " : " shared the problem ";
  const actor = notificationActor(notification, marker);
  const problemTitle = firstQuoted(notification.body);
  const personalMessage = trailingTextAfterQuotedSentence(notification.body);
  const translated = intent === "challenge"
    ? `${actor} vous a mis au défi de résoudre « ${problemTitle ?? "ce problème"} ».`
    : `${actor} a partagé avec vous le problème « ${problemTitle ?? "problème partagé"} ».`;

  return {
    title: intent === "challenge" ? "Nouveau défi" : "Un problème a été partagé avec vous",
    body: `${translated}${personalMessage ? ` ${personalMessage}` : ""}`
  };
}

function localizeFrenchNotification(notification: LocalizableNotification): LocalizedNotification {
  const problemTitle = firstQuoted(notification.body);

  switch (notification.type) {
    case NotificationType.PROBLEM_ATTEMPTED: {
      const actor = notificationActor(notification, " started working on ");
      return {
        title: "Quelqu’un travaille sur votre problème",
        body: problemTitle
          ? `${actor} a commencé à travailler sur « ${problemTitle} ».`
          : `${actor} a commencé à travailler sur votre problème.`
      };
    }
    case NotificationType.PROBLEM_SOLVED: {
      const actor = notificationActor(notification, " solved ");
      return {
        title: "Votre problème a été résolu",
        body: problemTitle ? `${actor} a résolu « ${problemTitle} ».` : `${actor} a résolu votre problème.`
      };
    }
    case NotificationType.PROBLEM_EDITED:
      return localizedProblemEdit(notification);
    case NotificationType.PROBLEM_EDIT_PROPOSED: {
      const actor = notificationActor(notification, " proposed changes to ");
      return {
        title: "Modification de problème proposée",
        body: problemTitle
          ? `${actor} a proposé des modifications pour « ${problemTitle} ».`
          : `${actor} a proposé une modification de problème.`
      };
    }
    case NotificationType.PROBLEM_EDIT_APPROVED:
      return {
        title: "Modification proposée approuvée",
        body: problemTitle
          ? `Vos modifications proposées pour « ${problemTitle} » sont maintenant publiques.`
          : "Vos modifications proposées sont maintenant publiques."
      };
    case NotificationType.PROBLEM_EDIT_REJECTED: {
      const reasonMarker = notification.body.indexOf(" were not accepted: ");
      const reason = reasonMarker >= 0 ? notification.body.slice(reasonMarker + " were not accepted: ".length) : "";
      return {
        title: "Modification proposée non retenue",
        body: `${problemTitle
          ? `Vos modifications proposées pour « ${problemTitle} » n’ont pas été retenues.`
          : "Vos modifications proposées n’ont pas été retenues."}${reason ? ` Motif : ${reason}` : ""}`
      };
    }
    case NotificationType.PROOF_ADDED: {
      const actor = notificationActor(notification, " added a solution");
      return { title: "Nouvelle solution à votre problème", body: `${actor} a ajouté une solution.` };
    }
    case NotificationType.SOLUTION_VOTED: {
      const actor = notificationActor(notification, " marked your solution ");
      return {
        title: "Votre solution a été jugée utile",
        body: problemTitle
          ? `${actor} a marqué votre solution à « ${problemTitle} » comme utile.`
          : `${actor} a marqué votre solution comme utile.`
      };
    }
    case NotificationType.SOLUTION_REPORTED:
      return localizedSolutionReport(notification);
    case NotificationType.DISCUSSION_POSTED: {
      if (notification.title === "New message about your solution") {
        const actor = notificationActor(notification, " commented on your solution to ");
        return {
          title: "Nouveau message au sujet de votre solution",
          body: problemTitle
            ? `${actor} a commenté votre solution à « ${problemTitle} ».`
            : `${actor} a commenté votre solution.`
        };
      }
      const actor = notificationActor(notification, " posted in the discussion of ");
      return {
        title: "Nouveau message de discussion",
        body: problemTitle
          ? `${actor} a publié un message dans la discussion de « ${problemTitle} ».`
          : `${actor} a publié un message dans la discussion de votre problème.`
      };
    }
    case NotificationType.ACHIEVEMENT_UNLOCKED:
      return localizeAchievementNotification(notification, "fr");
    case NotificationType.VERIFICATION_REQUESTED: {
      const actor = notificationActor(notification, " requested verification for ");
      return {
        title: "Vérification d’une solution demandée",
        body: problemTitle
          ? `${actor} a demandé la vérification de sa réponse à « ${problemTitle} ».`
          : `${actor} a demandé la vérification d’une solution.`
      };
    }
    case NotificationType.VERIFICATION_MESSAGE: {
      const actor = notificationActor(notification, " replied about ");
      return {
        title: "Nouveau message de vérification",
        body: problemTitle
          ? `${actor} a répondu au sujet de « ${problemTitle} ».`
          : `${actor} a répondu dans une discussion de vérification.`
      };
    }
    case NotificationType.VERIFICATION_APPROVED:
      return {
        title: "Solution vérifiée",
        body: problemTitle
          ? `Votre réponse à « ${problemTitle} » a été acceptée.`
          : "Votre réponse a été acceptée."
      };
    case NotificationType.VERIFICATION_REJECTED:
      return {
        title: "Vérification de la solution refusée",
        body: problemTitle
          ? `Votre réponse à « ${problemTitle} » n’a pas encore été acceptée.`
          : "Votre réponse n’a pas encore été acceptée."
      };
    case NotificationType.SITE_ERROR_REPORTED:
      return { title: "Erreur du site signalée", body: notification.body };
    case NotificationType.USER_REGISTERED: {
      const actor = notificationActor(notification, " joined Math Woods");
      return { title: "Nouveau compte créé", body: `${actor} a rejoint Math Woods.` };
    }
    case NotificationType.PROBLEM_CREATED: {
      const actor = notificationActor(notification, " created ");
      if (notification.title === "New problem translation") {
        const titles = quotedValues(notification.body);
        const languageMatch = notification.body.match(/ in ([^".]+)(?: titled |\.)/);
        const language = languageMatch?.[1]?.trim().replace(/^English$/i, "anglais").replace(/^Français$/i, "français");
        return {
          title: "Nouvelle traduction d’un problème",
          body: `${actor} a créé une traduction de « ${titles[0] ?? "un problème"} »${language ? ` en ${language}` : ""}${titles[1] ? ` sous le titre « ${titles[1]} »` : ""}.`
        };
      }
      return {
        title: "Nouveau problème créé",
        body: problemTitle ? `${actor} a créé « ${problemTitle} ».` : `${actor} a créé un problème.`
      };
    }
    case NotificationType.CONCEPT_CREATED: {
      const actor = notificationActor(notification, " created ");
      return {
        title: "Nouveau concept créé",
        body: problemTitle ? `${actor} a créé « ${problemTitle} ».` : `${actor} a créé un concept.`
      };
    }
    case NotificationType.CONCEPT_EDITED:
      return localizedConceptEdit(notification);
    case NotificationType.CONTRIBUTION_REQUEST_CLAIMED: {
      const actor = notificationActor(notification, " started working on ");
      const request = firstQuoted(notification.body);
      const kind = notification.body.includes(" a concept request") ? "concept" : "problème";
      return {
        title: "Demande de contribution prise en charge",
        body: request
          ? `${actor} a commencé à travailler sur une demande de ${kind} : « ${request} ».`
          : `${actor} a pris en charge une demande de contribution.`
      };
    }
    case NotificationType.CONTRIBUTION_REQUEST_REMINDER: {
      const count = Number(notification.body.match(/You have (\d+) requests/)?.[1] ?? (notification.body.includes("one request") ? 1 : 0));
      const request = firstQuoted(notification.body);
      return {
        title: count === 1 ? "Rappel de demande de contribution" : "Rappel de demandes de contribution",
        body: count === 1
          ? `Vous avez une demande en cours${request ? ` : « ${request} ».` : "."}`
          : `Vous avez ${count || "plusieurs"} demandes en cours${request ? `, dont : « ${request} ».` : "."}`
      };
    }
    case NotificationType.FRIEND_REQUEST: {
      if (notification.title === "Friend request accepted") {
        const actor = notificationActor(notification, " accepted your friend request");
        return { title: "Demande d’ami acceptée", body: `${actor} a accepté votre demande d’ami.` };
      }
      const actor = notificationActor(notification, " sent you a friend request");
      return { title: "Nouvelle demande d’ami", body: `${actor} vous a envoyé une demande d’ami.` };
    }
    case NotificationType.CHAT_MESSAGE: {
      const actor = notificationActor(notification, " sent you a message");
      return { title: "Nouveau message", body: `${actor} vous a envoyé un message.` };
    }
    case NotificationType.PROBLEM_CHALLENGE:
      return localizedProblemDelivery(notification, "challenge");
    case NotificationType.PROBLEM_SHARED:
      return localizedProblemDelivery(notification, "share");
    case NotificationType.PROBLEM_OF_THE_DAY: {
      const date = notification.body.match(/ will be featured on (.+)\.$/)?.[1];
      return {
        title: "Votre problème a été sélectionné comme problème du jour",
        body: problemTitle
          ? `« ${problemTitle} » sera mis à l’honneur${date ? ` le ${translateEnglishDateWords(date)}` : ""}.`
          : notification.body
      };
    }
    case NotificationType.EXPLORATION_PUBLISHED: {
      const explorationTitle = notification.title.replace(/ was published$/, "");
      return {
        title: explorationTitle === notification.title ? "Exploration publiée" : `${explorationTitle} a été publiée`,
        body: "L’exploration est prête à être lue."
      };
    }
    case NotificationType.DAILY_CONCEPT_REVIEW:
      return {
        title: "Révision quotidienne d’un concept",
        body: problemTitle
          ? `Vous pouvez aider à améliorer Math Woods en relisant « ${problemTitle} ».`
          : "Vous pouvez aider à améliorer Math Woods en relisant ce concept."
      };
    case NotificationType.CONTEST_UPDATE:
      if (notification.title === "You won the weekly contest") {
        return { title: "Vous avez remporté le concours hebdomadaire", body: "Votre problème a remporté le prix du concours hebdomadaire." };
      }
      if (notification.title === "Your problem received an honorable mention") {
        return { title: "Votre problème a reçu une mention honorable", body: "Les administrateurs ont mis en avant votre participation au concours." };
      }
      if (notification.title === "A new weekly contest has begun") {
        return { title: "Un nouveau concours hebdomadaire a commencé", body: notification.body };
      }
      if (notification.title === "The weekly contest ends today") {
        return { title: "Le concours hebdomadaire se termine aujourd’hui", body: "Vous pouvez encore modifier le problème proposé jusqu’à la fin de la journée, heure de Paris." };
      }
      return { title: "Actualité du concours hebdomadaire", body: notification.body };
    case NotificationType.TRUSTED_USER_CANDIDATE: {
      const actor = actorName(notification) ?? textBefore(notification.body, " has reached ") ?? "Cet utilisateur";
      const reputation = notification.body.match(/ has reached (\d+) reputation/)?.[1];
      return {
        title: "Proposition d’utilisateur de confiance",
        body: `${actor} a atteint${reputation ? ` ${reputation} points de` : " le seuil de"} réputation. Voulez-vous lui accorder le statut d’utilisateur de confiance ?`
      };
    }
    case NotificationType.TRUSTED_USER_PROMOTED:
      return {
        title: "Vous êtes désormais un utilisateur de confiance",
        body: "Vous avez maintenant accès aux outils de contribution et de modération réservés aux utilisateurs de confiance."
      };
    case NotificationType.SITE_IMPROVEMENT_COMPLETED: {
      const improvementTitle = notification.siteImprovementReview?.improvement.title ?? problemTitle;
      return {
        title: "Votre suggestion a bien été prise en compte",
        body: improvementTitle
          ? `« ${improvementTitle} » est prête à être testée. Vérifiez que tout fonctionne comme prévu, puis confirmez lorsque vous êtes satisfait.`
          : notification.body
      };
    }
  }
}

export function localizeNotification(notification: LocalizableNotification, locale: InterfaceLocale) {
  if (notification.type === NotificationType.ACHIEVEMENT_UNLOCKED) {
    return localizeAchievementNotification(notification, locale);
  }

  if (notification.type === NotificationType.SITE_IMPROVEMENT_COMPLETED) {
    const improvementTitle = notification.siteImprovementReview?.improvement.title;
    if (improvementTitle) {
      return locale === "fr"
        ? localizeFrenchNotification(notification)
        : {
            title: "Your suggestion has been implemented",
            body: `"${improvementTitle}" is ready to test. Check that it works as expected, then confirm when you are satisfied.`
          };
    }
  }

  return locale === "fr"
    ? localizeFrenchNotification(notification)
    : { title: notification.title, body: notification.body };
}
