export type MathWoodsTourLocale = "en" | "fr";

export type MathWoodsTourTarget =
  | "daily"
  | "progress"
  | "recommendations"
  | "tip"
  | "friends"
  | "chat"
  | "nav-problems"
  | "problem-browser"
  | "open-problem"
  | "statement"
  | "help"
  | "nav-concepts"
  | "menu";

export type MathWoodsTourStep = {
  target?: MathWoodsTourTarget;
  placement?: "bottom" | "left" | "right" | "top";
  text: string;
  action?: "open-problems" | "open-problem" | "finish";
};

export const MATH_WOODS_TOUR_PARAM = "tour";
export const MATH_WOODS_TOUR_STEP_PARAM = "tourStep";
export const MATH_WOODS_TOUR_LOCALE_PARAM = "tourLocale";

export const mathWoodsTourCopy = {
  fr: {
    pageTitle: "C'est quoi Math Woods\u00a0?",
    intro:
      "Découvrez les principales pages de Math Woods en quelques minutes.",
    language: "Langue du tutoriel",
    start: "Démarrer le tutoriel",
    backToSite: "Retourner sur Math Woods",
    finish: "Fin du tutoriel",
    previous: "Précédent",
    next: "Suivant",
    close: "Quitter le tutoriel",
    step: (current: number, total: number) => `Étape ${current} sur ${total}`,
    unavailable: "Cet élément n’est pas visible dans cette configuration. Vous pouvez poursuivre avec le bouton du tutoriel.",
    steps: [
      {
        text: "Math Woods est un site open source dont l'objectif est de vous permettre d'apprendre des mathématiques de tout niveau, du collège au master de mathématiques fondamentales, de manière pédagogique."
      },
      {
        text: "C'est un site contributif dans lequel chacun est libre de poster des problèmes, d'expliquer des concepts, de partager ce qui lui plaît mathématiquement et de réfléchir de manière ludique, sans compétitivité. Voyons maintenant plus précisément ses fonctionnalités."
      },
      {
        target: "daily",
        placement: "right",
        text: "Un nouveau problème illustré vous est présenté tous les jours. Si vous ne savez pas par où commencer votre balade, vous pouvez commencer par là !"
      },
      {
        target: "progress",
        placement: "left",
        text: "Ici, vous voyez le nombre de problèmes que vous avez résolus dans chaque catégorie. Cette progression apparaît une fois connecté à votre compte."
      },
      {
        target: "recommendations",
        placement: "right",
        text: "Des problèmes vous sont recommandés en fonction de vos goûts. Indiquez ceux qui vous semblent trop difficiles ou trop simples, ainsi que ceux que vous aimez, pour adapter progressivement ces recommandations."
      },
      {
        target: "tip",
        placement: "right",
        text: "Tous les jours, un nouveau conseil ou une nouvelle méthodologie vous est présenté afin d'améliorer votre compréhension des mathématiques. Des problèmes d'application permettent ensuite de mettre ces idées en pratique."
      },
      {
        target: "friends",
        placement: "left",
        text: "Faire des mathématiques avec des amis est souvent plus agréable. Cet encadré rassemble leurs dernières contributions."
      },
      {
        target: "chat",
        placement: "left",
        text: "Une fois connecté, le bouton placé en bas à droite permet de retrouver vos amis et de discuter avec eux."
      },
      {
        target: "nav-problems",
        placement: "bottom",
        action: "open-problems",
        text: "Cliquez maintenant sur « Problèmes » dans la barre de navigation pour accéder au navigateur de problèmes."
      },
      {
        target: "problem-browser",
        placement: "top",
        text: "Voici le navigateur de problèmes. Vous pouvez trier les problèmes par difficulté, les filtrer par domaine ou rechercher un mot-clé."
      },
      {
        target: "open-problem",
        placement: "top",
        action: "open-problem",
        text: "Cette liste contient tous les problèmes postés par la communauté. Cliquez sur le premier problème mis en évidence pour ouvrir sa page."
      },
      {
        target: "statement",
        placement: "bottom",
        text: "Vous voici face à l'énoncé d'un problème. Les commandes situées juste en dessous permettent de travailler sur le problème, de signaler que vous l'avez résolu et de l'aimer. Pendant ce tutoriel, aucune de ces actions n'est enregistrée."
      },
      {
        target: "help",
        placement: "right",
        text: "Des indications et des solutions peuvent être proposées sous l'énoncé. Le contenu est rédigé par les utilisateurs et modéré par des contributeurs de confiance, comme sur Wikipédia. Les parties manquantes sont autant d'occasions de contribuer."
      },
      {
        target: "nav-concepts",
        placement: "bottom",
        text: "Math Woods comprend aussi une encyclopédie des concepts mathématiques présents dans les problèmes. Les pages de concepts regroupent définitions, exemples et exercices d'application."
      },
      {
        text: "Nous avons fait le tour des principales fonctionnalités. Vous pouvez maintenant explorer librement les autres pages et les nouveautés du site."
      },
      {
        target: "menu",
        placement: "left",
        action: "finish",
        text: "Math Woods est collaboratif et vos retours sont précieux. Le menu en haut à droite donne accès aux autres espaces du site. Vous pouvez maintenant terminer le tutoriel et commencer votre propre balade."
      }
    ] satisfies MathWoodsTourStep[]
  },
  en: {
    pageTitle: "What is Math Woods?",
    intro:
      "Discover the main pages of Math Woods in a few minutes.",
    language: "Tour language",
    start: "Start the tour",
    backToSite: "Back to Math Woods",
    finish: "End the tour",
    previous: "Previous",
    next: "Next",
    close: "Leave the tour",
    step: (current: number, total: number) => `Step ${current} of ${total}`,
    unavailable: "This element is not visible in the current layout. You can continue with the tour button.",
    steps: [
      {
        text: "Math Woods is an open-source site designed to help you learn mathematics at every level, from middle school to graduate-level pure mathematics, through clear educational content."
      },
      {
        text: "It is a collaborative site where everyone can post problems, explain concepts, share mathematics they enjoy, and explore ideas playfully without competition. Let us look at its features in more detail."
      },
      {
        target: "daily",
        placement: "right",
        text: "A new illustrated problem is presented every day. If you are not sure where to begin your walk, you can start here!"
      },
      {
        target: "progress",
        placement: "left",
        text: "Here you can see how many problems you have solved in each category. This progress appears once you are signed in to your account."
      },
      {
        target: "recommendations",
        placement: "right",
        text: "Problems are recommended according to your tastes. Marking what felt too hard or too easy, and what you liked, gradually improves these recommendations."
      },
      {
        target: "tip",
        placement: "right",
        text: "Every day, a new tip or method is presented to strengthen your understanding of mathematics. Related practice problems let you try these ideas yourself."
      },
      {
        target: "friends",
        placement: "left",
        text: "Mathematics is often more enjoyable with friends. This panel brings together their latest contributions."
      },
      {
        target: "chat",
        placement: "left",
        text: "Once signed in, the button in the bottom-right corner lets you find your friends and chat with them."
      },
      {
        target: "nav-problems",
        placement: "bottom",
        action: "open-problems",
        text: "Now select “Problems” in the navigation bar to open the problem browser."
      },
      {
        target: "problem-browser",
        placement: "top",
        text: "This is the problem browser. You can sort problems by difficulty, filter them by domain, or search by keyword."
      },
      {
        target: "open-problem",
        placement: "top",
        action: "open-problem",
        text: "This list contains all the problems posted by the community. Select the first highlighted problem to open its page."
      },
      {
        target: "statement",
        placement: "bottom",
        text: "Here is a problem statement. The controls just below let you work on it, mark it as solved, and like it. None of these actions are recorded during the tour."
      },
      {
        target: "help",
        placement: "right",
        text: "Hints and solutions may be available below the statement. Content is written by users and moderated by trusted contributors, much like Wikipedia. Missing parts are opportunities to contribute."
      },
      {
        target: "nav-concepts",
        placement: "bottom",
        text: "Math Woods also includes an encyclopedia of the mathematical concepts found in problems. Concept pages bring together definitions, examples, and practice exercises."
      },
      {
        text: "That covers the main features. You can now freely explore the site's other pages and new additions."
      },
      {
        target: "menu",
        placement: "left",
        action: "finish",
        text: "Math Woods is collaborative, and your feedback matters. The top-right menu gives access to the site's other spaces. You can now end the tour and begin your own walk."
      }
    ] satisfies MathWoodsTourStep[]
  }
} as const;

export function parseMathWoodsTourLocale(value: string | null | undefined): MathWoodsTourLocale {
  return value === "fr" ? "fr" : "en";
}

export function parseMathWoodsTourStep(value: string | null | undefined, total: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), total - 1) : 0;
}
