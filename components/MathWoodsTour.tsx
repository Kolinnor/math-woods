"use client";

import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  Lightbulb,
  Menu,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type TourLocale = "en" | "fr";
type TourSurface = "home" | "problem-list" | "problem";
type TourTarget =
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
  | "nav-users"
  | "menu";

type TourStep = {
  target?: TourTarget;
  placement?: "bottom" | "left" | "right" | "top";
  text: string;
  action?: "open-problems" | "open-problem" | "finish";
};

const copy = {
  fr: {
    pageTitle: "C'est quoi Math Woods ?",
    intro:
      "Découvrez les principales pages de Math Woods avec un exemple guidé. Le parcours ne modifie ni votre compte ni votre progression.",
    language: "Langue du tutoriel",
    start: "Démarrer le tutoriel",
    backToSite: "Retourner sur Math Woods",
    finish: "Fin du tutoriel",
    previous: "Précédent",
    next: "Suivant",
    close: "Quitter le tutoriel",
    step: (current: number, total: number) => `Étape ${current} sur ${total}`,
    problems: "Problèmes",
    concepts: "Concepts",
    users: "Utilisateurs",
    signIn: "Se connecter",
    homeTitle: "Résoudre, comprendre et partager des mathématiques",
    problemOfDay: "Problème du jour",
    eclipse: "Le problème de l'éclipse",
    geometry: "Géométrie",
    solveToday: "Résoudre le problème du jour",
    progress: "Progression",
    solved: "0 problème résolu",
    algebra: "Algèbre",
    geometryShort: "Géométrie",
    numberTheory: "Théorie des nombres",
    recommendations: "Recommandés pour vous",
    openProblem: "Ouvrir le problème",
    tip: "Conseil du jour",
    tipTitle: "Partir de la conclusion",
    tipBody: "Commencez par préciser ce qu'il faudrait établir, puis remontez vers les données du problème.",
    practice: "Voir les problèmes d'application",
    friends: "Amis",
    bearAction: "Ours a créé Le problème de l'éclipse.",
    woodAction: "Bois a ajouté une solution à ce problème.",
    justNow: "à l'instant",
    chat: "Discussion avec vos amis",
    allProblems: "Tous les problèmes",
    browserIntro: "Parcourez les problèmes par domaine, difficulté ou mot-clé.",
    search: "Rechercher un problème",
    oneProblem: "1 problème affiché",
    statement: "Énoncé",
    statementBody:
      "Lors d'une éclipse, le Soleil et la Lune semblent avoir le même diamètre apparent. Que peut-on en déduire sur le rapport de leurs tailles et de leurs distances à la Terre ?",
    solvedAction: "Je l'ai résolu",
    workAction: "Travailler sur ce problème",
    favoriteAction: "Ajouter à mes favoris",
    hints: "Indications",
    hintBody: "Comparez les triangles formés par l'œil de l'observateur et les diamètres apparents des deux astres.",
    solution: "Solution",
    solutionBody: "Une solution détaillée peut être proposée, relue et améliorée par la communauté.",
    menuLabel: "Plus",
    suggestions: "Suggestions",
    steps: [
      {
        text: "Bienvenue sur Math Woods ! Je suis Ancient Tree, le créateur du site, et je vais vous guider pas à pas pour vous faire la main avec ce que j'espère devenir votre nouvel outil de travail. Ce tutoriel, basé sur une page de garde figée du site, a pour but de vous présenter les grandes lignes du site."
      },
      {
        text: "MathWoods est un site open source dont l'objectif est de vous permettre d'apprendre des mathématiques de tout niveau (du collège aux conjectures encore irrésolues actuellement) et de manière pédagogique. C'est un site contributif dans lequel chacun est libre de poster des problèmes, d'expliquer des concepts, de partager ce qui lui plaît mathématiquement et d'en résoudre de manière ludique, sans compétitivité. Voyons maintenant plus précisément ses fonctionnalités."
      },
      {
        target: "daily",
        placement: "right",
        text: "Ici, un nouveau problème illustré vous sera présenté tous les jours. Si vous ne savez pas quoi faire, vous pourrez commencer par là !"
      },
      {
        target: "progress",
        placement: "left",
        text: "Ici vous pourrez voir le nombre de problèmes que vous avez résolu dans chaque catégorie."
      },
      {
        target: "recommendations",
        placement: "right",
        text: "Ici vous aurez diverses recommandations de problèmes en fonction de votre niveau ainsi que de vos goûts. N'hésitez donc pas à nous signifier quels problèmes vous avez trouvés trop durs ou trop simples, et ceux que vous avez aimés ou non, pour que vos recommandations soient bien cohérentes avec vos besoins !"
      },
      {
        target: "tip",
        placement: "right",
        text: "Tous les jours, un nouveau conseil ou une nouvelle méthodologie vous sera présentée afin d'améliorer votre compréhension des mathématiques. Divers problèmes d'application seront directement proposés afin de vous faire la main sur ces idées."
      },
      {
        target: "friends",
        placement: "left",
        text: "Bien sûr, faire des maths avec des amis reste plus fun ! Cet encadré servira à voir quelles sont les dernières contributions de ces derniers."
      },
      {
        target: "chat",
        placement: "left",
        text: "Vous pourrez aussi discuter avec vos amis via ce tchat."
      },
      {
        target: "nav-problems",
        placement: "bottom",
        action: "open-problems",
        text: "Mais cessons de tourner autour du pot, cliquez ici pour accéder à la page des problèmes."
      },
      {
        target: "problem-browser",
        placement: "right",
        text: "Vous êtes maintenant sur la page recensant tous les problèmes du site. Vous pourrez résoudre des problèmes triés par niveau de difficulté."
      },
      {
        target: "open-problem",
        placement: "bottom",
        action: "open-problem",
        text: "Vous retrouvez ici les problèmes de la première page qui seraient susceptibles de vous intéresser. Voyons enfin de quoi il s'agit."
      },
      {
        target: "statement",
        placement: "right",
        text: "Ici vous avez l'énoncé du problème. Vous pouvez ensuite travailler dessus de votre côté en cliquant sur « Travailler sur ce problème ». Une fois résolu, cliquez sur « Je l'ai résolu » : on vous demandera parfois une vérification où le concepteur du problème pourra juger de votre bonne foi et de la qualité de votre travail, mais ce n'est pas automatique. Enfin, si vous avez aimé le problème, cliquez sur « Ajouter à mes favoris ». N'oubliez pas de le faire, cela fait vivre le site !"
      },
      {
        target: "help",
        placement: "right",
        text: "Si jamais vous êtes bloqués, diverses indications sont à votre disposition sous le problème ainsi qu'une solution. Les énoncés de problèmes, les diverses modifications apportées, les traductions, les concepts, les indications ainsi que les solutions sont rédigés par des utilisateurs du site comme vous ou moi. Il peut donc y avoir des manques à combler, c'est pour cela que nous avons besoin de vous si jamais vous avez une idée que d'autres n'ont pas eue ou pas eu le temps d'écrire !"
      },
      {
        target: "nav-concepts",
        placement: "bottom",
        text: "Le tutoriel est bientôt fini, ne vous en faites pas. Ici nous avons une encyclopédie regroupant tous les concepts mathématiques mis en avant sur ce site. N'hésitez pas à cliquer sur un mot qui vous semble inconnu dans un énoncé pour voir le concept associé. Il vous sera donné une définition claire, des exemples ainsi que des exercices d'application (à différencier des « problèmes »)."
      },
      {
        target: "nav-users",
        placement: "bottom",
        text: "Le tutoriel est bientôt fini, ne vous en faites pas. Ici nous avons une encyclopédie regroupant tous les concepts mathématiques mis en avant sur ce site. N'hésitez pas à cliquer sur un mot qui vous semble inconnu dans un énoncé pour voir le concept associé. Il vous sera donné une définition claire, des exemples ainsi que des exercices d'application (à différencier des « problèmes »)."
      },
      {
        text: "Et voilà, je crois que nous avons fait le tour des fonctionnalités principales du site. Bien sûr il y en a d'autres et je vous laisserai les découvrir par vous-même. Je suis certes l'arbre le plus ancien du site, mais je n'ai pas toute la vie devant moi ;) !"
      },
      {
        target: "menu",
        placement: "left",
        action: "finish",
        text: "Trêve de plaisanterie. Je disais donc, le site Math Woods est collaboratif. Certaines fonctionnalités sont encore en travaux et divers bugs résident toujours sur le site. N'hésitez donc pas à nous en faire part en cliquant sur les trois traits en haut à droite de votre écran puis dans « Suggestions ». L'équipe du site sera vraiment contente d'avoir n'importe quel retour ! Pour cela, n'oubliez pas de créer un compte, cela vous permettra d'accéder à tous les problèmes et concepts actuels du site. Bon amusement !"
      }
    ] satisfies TourStep[]
  },
  en: {
    pageTitle: "What is Math Woods?",
    intro:
      "Discover the main parts of Math Woods through a guided example. The tour does not change your account or progress.",
    language: "Tour language",
    start: "Start the tour",
    backToSite: "Back to Math Woods",
    finish: "End the tour",
    previous: "Previous",
    next: "Next",
    close: "Leave the tour",
    step: (current: number, total: number) => `Step ${current} of ${total}`,
    problems: "Problems",
    concepts: "Concepts",
    users: "Users",
    signIn: "Sign in",
    homeTitle: "Solve, understand, and share mathematics",
    problemOfDay: "Problem of the day",
    eclipse: "The eclipse problem",
    geometry: "Geometry",
    solveToday: "Solve today's problem",
    progress: "Progress",
    solved: "0 problems solved",
    algebra: "Algebra",
    geometryShort: "Geometry",
    numberTheory: "Number theory",
    recommendations: "Recommended for you",
    openProblem: "Open problem",
    tip: "Tip of the day",
    tipTitle: "Start from the conclusion",
    tipBody: "Begin by stating what must be proved, then work backwards toward the information in the problem.",
    practice: "See practice problems",
    friends: "Friends",
    bearAction: "Bear created The eclipse problem.",
    woodAction: "Wood added a solution to this problem.",
    justNow: "just now",
    chat: "Chat with your friends",
    allProblems: "All problems",
    browserIntro: "Browse problems by domain, difficulty, or keyword.",
    search: "Search for a problem",
    oneProblem: "1 problem shown",
    statement: "Statement",
    statementBody:
      "During an eclipse, the Sun and Moon appear to have the same angular diameter. What does this tell us about the ratio between their sizes and their distances from Earth?",
    solvedAction: "I solved it",
    workAction: "Work on this problem",
    favoriteAction: "Add to favorites",
    hints: "Hints",
    hintBody: "Compare the triangles formed by the observer's eye and the apparent diameters of the two objects.",
    solution: "Solution",
    solutionBody: "A detailed solution can be proposed, reviewed, and improved by the community.",
    menuLabel: "More",
    suggestions: "Suggestions",
    steps: [
      {
        text: "Welcome to Math Woods! I am Ancient Tree, the creator of the site, and I will guide you step by step as you get familiar with what I hope will become your new study tool. This tour uses a fixed version of the home page to introduce the main parts of the site."
      },
      {
        text: "MathWoods is an open-source site designed to help you learn mathematics at every level, from middle school to conjectures that remain unsolved today, in an educational way. It is a collaborative site where everyone is free to post problems, explain concepts, share the mathematics they enjoy, and solve problems in a playful, non-competitive setting. Let us now look at its features in more detail."
      },
      {
        target: "daily",
        placement: "right",
        text: "A new illustrated problem will be presented here every day. If you are not sure what to do, you can start here!"
      },
      {
        target: "progress",
        placement: "left",
        text: "Here you can see how many problems you have solved in each category."
      },
      {
        target: "recommendations",
        placement: "right",
        text: "Here you will find problem recommendations based on your level and your tastes. Tell us which problems felt too hard or too easy, and which ones you liked or disliked, so that your recommendations match your needs."
      },
      {
        target: "tip",
        placement: "right",
        text: "Every day, a new tip or method will be presented to help improve your understanding of mathematics. Related practice problems will be suggested so that you can try these ideas yourself."
      },
      {
        target: "friends",
        placement: "left",
        text: "Of course, doing mathematics with friends is more fun! This section shows their latest contributions."
      },
      {
        target: "chat",
        placement: "left",
        text: "You can also chat with your friends here."
      },
      {
        target: "nav-problems",
        placement: "bottom",
        action: "open-problems",
        text: "Let us get to the point: click here to open the problems page."
      },
      {
        target: "problem-browser",
        placement: "right",
        text: "You are now on the page that lists all the problems on the site. You can solve problems arranged by difficulty level."
      },
      {
        target: "open-problem",
        placement: "bottom",
        action: "open-problem",
        text: "Here you will find the problems from the first page that may interest you. Let us finally see what one looks like."
      },
      {
        target: "statement",
        placement: "right",
        text: "Here is the problem statement. You can work on it by selecting “Work on this problem”. Once you have solved it, select “I solved it”. You may sometimes be asked for verification so that the problem author can assess your good faith and the quality of your work, but this is not automatic. Finally, if you enjoyed the problem, select “Add to favorites”. Remember to do so: it helps keep the site active!"
      },
      {
        target: "help",
        placement: "right",
        text: "If you get stuck, hints and a solution are available below the problem. Problem statements, edits, translations, concepts, hints, and solutions are written by site users like you and me. Some parts may still need to be completed, so we need your help whenever you have an idea that others have not had or have not had time to write down."
      },
      {
        target: "nav-concepts",
        placement: "bottom",
        text: "The tour is almost over. Here we have an encyclopedia containing all the mathematical concepts featured on the site. Select an unfamiliar word in a problem statement to view its concept page. You will find a clear definition, examples, and practice exercises, which are different from problems."
      },
      {
        target: "nav-users",
        placement: "bottom",
        text: "The tour is almost over. Here we have an encyclopedia containing all the mathematical concepts featured on the site. Select an unfamiliar word in a problem statement to view its concept page. You will find a clear definition, examples, and practice exercises, which are different from problems."
      },
      {
        text: "There we are. I think we have covered the site's main features. There are others, of course, and I will let you discover them for yourself. I may be the oldest tree on the site, but I do not have all the time in the world ;) !"
      },
      {
        target: "menu",
        placement: "left",
        action: "finish",
        text: "Joking aside, Math Woods is a collaborative site. Some features are still under construction and a few bugs remain. Please tell us about them by opening the three-line menu in the top-right corner and selecting “Suggestions”. The team will be very happy to receive any feedback. Remember to create an account so that you can access all the current problems and concepts on the site. Have fun!"
      }
    ] satisfies TourStep[]
  }
} as const;

function targetClass(activeTarget: TourTarget | undefined, target: TourTarget, interactive = false) {
  return activeTarget === target
    ? `math-tour-target active${interactive ? " interactive" : ""}`
    : "math-tour-target";
}

function TourNavigation({
  activeTarget,
  onOpenProblems,
  locale,
  text
}: {
  activeTarget?: TourTarget;
  onOpenProblems: () => void;
  locale: TourLocale;
  text: (typeof copy)[TourLocale];
}) {
  return (
    <header className="math-tour-nav">
      <button type="button" className="math-tour-brand" aria-label="Math Woods">
        <img src="/math-woods-bear.png" alt="" aria-hidden="true" />
        <span>Math Woods</span>
      </button>
      <nav aria-label={locale === "fr" ? "Navigation de démonstration" : "Demonstration navigation"}>
        <button
          type="button"
          data-tour-target="nav-problems"
          className={targetClass(activeTarget, "nav-problems", true)}
          onClick={onOpenProblems}
        >
          {text.problems}
        </button>
        <button
          type="button"
          data-tour-target="nav-concepts"
          className={targetClass(activeTarget, "nav-concepts")}
        >
          {text.concepts}
        </button>
        <button
          type="button"
          data-tour-target="nav-users"
          className={targetClass(activeTarget, "nav-users")}
        >
          {text.users}
        </button>
      </nav>
      <div className="math-tour-nav-tools">
        <span>{locale.toUpperCase()}</span>
        <button
          type="button"
          aria-label={text.menuLabel}
          data-tour-target="menu"
          className={targetClass(activeTarget, "menu")}
        >
          <Menu size={19} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function EclipseVisual() {
  return (
    <div className="math-tour-eclipse" aria-hidden="true">
      <span className="math-tour-sun" />
      <span className="math-tour-moon" />
      <span className="math-tour-corona" />
    </div>
  );
}

function TourHome({ activeTarget, text }: { activeTarget?: TourTarget; text: (typeof copy)[TourLocale] }) {
  return (
    <div className="math-tour-home">
      <section className="math-tour-hero">
        <img src="/art/morning-in-a-pine-forest.jpg" alt="" />
        <div />
        <h1>{text.homeTitle}</h1>
      </section>
      <main className="math-tour-dashboard">
        <div className="math-tour-main-column">
          <section data-tour-target="daily" className={`math-tour-daily ${targetClass(activeTarget, "daily")}`}>
            <div className="math-tour-daily-copy">
              <p className="eyebrow">{text.problemOfDay}</p>
              <h2>{text.eclipse}</h2>
              <p>{text.geometry} · 28</p>
              <button type="button">{text.solveToday}</button>
            </div>
            <EclipseVisual />
          </section>

          <section
            data-tour-target="recommendations"
            className={`math-tour-section ${targetClass(activeTarget, "recommendations")}`}
          >
            <h2>{text.recommendations}</h2>
            <div className="math-tour-recommendation-row">
              <span className="math-tour-difficulty">28</span>
              <span><strong>{text.eclipse}</strong><small>{text.geometry}</small></span>
              <ChevronRight size={18} aria-hidden="true" />
            </div>
          </section>

          <section data-tour-target="tip" className={`math-tour-tip ${targetClass(activeTarget, "tip")}`}>
            <Lightbulb size={28} aria-hidden="true" />
            <div>
              <p className="eyebrow">{text.tip}</p>
              <h2>{text.tipTitle}</h2>
              <p>{text.tipBody}</p>
              <button type="button">{text.practice}</button>
            </div>
          </section>
        </div>

        <aside className="math-tour-rail">
          <section
            data-tour-target="progress"
            className={`math-tour-side-card ${targetClass(activeTarget, "progress")}`}
          >
            <h2>{text.progress}</h2>
            <p className="math-tour-muted">{text.solved}</p>
            {[text.algebra, text.geometryShort, text.numberTheory].map((domain) => (
              <div className="math-tour-progress-line" key={domain}>
                <span>{domain}</span><small>0 / 0</small><i />
              </div>
            ))}
          </section>
          <section
            data-tour-target="friends"
            className={`math-tour-side-card ${targetClass(activeTarget, "friends")}`}
          >
            <h2>{text.friends}</h2>
            <div className="math-tour-activity"><span>O</span><p>{text.bearAction}<small>{text.justNow}</small></p></div>
            <div className="math-tour-activity"><span>B</span><p>{text.woodAction}<small>{text.justNow}</small></p></div>
          </section>
        </aside>
      </main>
      <button
        type="button"
        data-tour-target="chat"
        aria-label={text.chat}
        className={`math-tour-chat ${targetClass(activeTarget, "chat")}`}
      >
        <MessageCircle size={23} aria-hidden="true" />
        <span>2</span>
      </button>
    </div>
  );
}

function TourProblemList({
  activeTarget,
  onOpenProblem,
  text
}: {
  activeTarget?: TourTarget;
  onOpenProblem: () => void;
  text: (typeof copy)[TourLocale];
}) {
  return (
    <main className="math-tour-content-page">
      <section
        data-tour-target="problem-browser"
        className={`math-tour-browser-heading ${targetClass(activeTarget, "problem-browser")}`}
      >
        <p className="eyebrow">Math Woods</p>
        <h1>{text.allProblems}</h1>
        <p>{text.browserIntro}</p>
        <div className="math-tour-search">{text.search}</div>
      </section>
      <div className="math-tour-browser-layout">
        <aside>
          <strong>{text.geometry}</strong>
          <span>1</span>
        </aside>
        <section>
          <p className="math-tour-muted">{text.oneProblem}</p>
          <article
            data-tour-target="open-problem"
            className={`math-tour-problem-row ${targetClass(activeTarget, "open-problem", true)}`}
          >
            <span className="math-tour-difficulty">28</span>
            <div><h2>{text.eclipse}</h2><p>{text.geometry}</p></div>
            <button type="button" onClick={onOpenProblem}>{text.openProblem}</button>
          </article>
        </section>
      </div>
    </main>
  );
}

function TourProblem({ activeTarget, text }: { activeTarget?: TourTarget; text: (typeof copy)[TourLocale] }) {
  return (
    <main className="math-tour-content-page math-tour-problem-page">
      <div className="math-tour-problem-heading">
        <p>{text.geometry} · 28</p>
        <h1>{text.eclipse}</h1>
      </div>
      <section data-tour-target="statement" className={`math-tour-paper ${targetClass(activeTarget, "statement")}`}>
        <h2>{text.statement}</h2>
        <p>{text.statementBody}</p>
        <div className="math-tour-problem-actions">
          <button type="button"><Check size={17} aria-hidden="true" />{text.solvedAction}</button>
          <button type="button">{text.workAction}</button>
          <button type="button"><Bookmark size={17} aria-hidden="true" />{text.favoriteAction}</button>
        </div>
      </section>
      <section data-tour-target="help" className={`math-tour-help-grid ${targetClass(activeTarget, "help")}`}>
        <article><h2>{text.hints}</h2><p>{text.hintBody}</p></article>
        <article><h2>{text.solution}</h2><p>{text.solutionBody}</p></article>
      </section>
    </main>
  );
}

export function MathWoodsTour({ initialLocale }: { initialLocale: TourLocale }) {
  const [locale, setLocale] = useState<TourLocale>(initialLocale);
  const [stepIndex, setStepIndex] = useState(-1);
  const [surface, setSurface] = useState<TourSurface>("home");
  const dialogRef = useRef<HTMLDivElement>(null);
  const text = copy[locale];
  const steps = text.steps;
  const step = stepIndex >= 0 ? steps[stepIndex] : undefined;
  const activeTarget = step?.target;

  useEffect(() => {
    if (stepIndex < 0) return;
    dialogRef.current?.focus({ preventScroll: true });
    if (!activeTarget) return;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-tour-target="${activeTarget}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeTarget, stepIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stepIndex >= 0) setStepIndex(-1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepIndex]);

  const start = () => {
    setSurface("home");
    setStepIndex(0);
  };

  const goPrevious = () => {
    if (stepIndex <= 0) {
      setStepIndex(-1);
      return;
    }
    const previous = stepIndex - 1;
    if (previous <= 8) setSurface("home");
    else if (previous <= 10) setSurface("problem-list");
    else setSurface("problem");
    setStepIndex(previous);
  };

  const goNext = () => {
    if (stepIndex < steps.length - 1) setStepIndex((current) => current + 1);
  };

  const openProblems = () => {
    if (step?.action !== "open-problems") return;
    setSurface("problem-list");
    setStepIndex((current) => current + 1);
  };

  const openProblem = () => {
    if (step?.action !== "open-problem") return;
    setSurface("problem");
    setStepIndex((current) => current + 1);
  };

  return (
    <div className="math-woods-tour" data-surface={surface}>
      {stepIndex < 0 ? (
        <section className="math-tour-start">
          <img src="/math-woods-bear.png" alt="" aria-hidden="true" />
          <p className="eyebrow">Math Woods</p>
          <h1>{text.pageTitle}</h1>
          <p>{text.intro}</p>
          <fieldset>
            <legend>{text.language}</legend>
            <div className="math-tour-language">
              <button type="button" className={locale === "fr" ? "active" : ""} onClick={() => setLocale("fr")}>Français</button>
              <button type="button" className={locale === "en" ? "active" : ""} onClick={() => setLocale("en")}>English</button>
            </div>
          </fieldset>
          <div className="math-tour-start-actions">
            <button type="button" className="mw-primary-button" onClick={start}>
              {text.start}<ArrowRight size={17} aria-hidden="true" />
            </button>
            <Link href="/" className="button secondary">{text.backToSite}</Link>
          </div>
        </section>
      ) : (
        <>
          <div className="math-tour-stage" aria-hidden={stepIndex >= 0 ? undefined : true}>
            <TourNavigation
              activeTarget={activeTarget}
              onOpenProblems={openProblems}
              locale={locale}
              text={text}
            />
            {surface === "home" && <TourHome activeTarget={activeTarget} text={text} />}
            {surface === "problem-list" && (
              <TourProblemList activeTarget={activeTarget} onOpenProblem={openProblem} text={text} />
            )}
            {surface === "problem" && <TourProblem activeTarget={activeTarget} text={text} />}
          </div>
          <div className="math-tour-shade" aria-hidden="true" />
          <div
            ref={dialogRef}
            className="math-tour-callout"
            data-placement={step?.placement ?? "bottom"}
            role="dialog"
            aria-label={text.step(stepIndex + 1, steps.length)}
            tabIndex={-1}
          >
            <div className="math-tour-callout-header">
              <span>{text.step(stepIndex + 1, steps.length)}</span>
              <Link href="/" aria-label={text.close}>×</Link>
            </div>
            <p>{step?.text}</p>
            <div className="math-tour-callout-actions">
              <button type="button" onClick={goPrevious} className="math-tour-back">
                <ArrowLeft size={16} aria-hidden="true" />{text.previous}
              </button>
              {step?.action === "open-problems" || step?.action === "open-problem" ? (
                <span className="math-tour-action-hint">
                  <ChevronRight size={16} aria-hidden="true" />
                  {step.action === "open-problems" ? text.problems : text.openProblem}
                </span>
              ) : step?.action === "finish" ? (
                <button type="button" onClick={() => setStepIndex(-1)} className="mw-primary-button">
                  <Check size={16} aria-hidden="true" />{text.finish}
                </button>
              ) : (
                <button type="button" onClick={goNext} className="mw-primary-button">
                  {text.next}<ArrowRight size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
