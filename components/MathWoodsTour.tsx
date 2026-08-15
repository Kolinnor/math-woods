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
    finish: "Terminer",
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
        text: "Bienvenue sur Math Woods. Ce parcours présente les principales parties du site à partir d'une page de démonstration."
      },
      {
        text: "Math Woods est un site open source pour apprendre les mathématiques à tous les niveaux. Chacun peut résoudre des problèmes, expliquer des concepts et partager ses idées, à son rythme."
      },
      {
        target: "daily",
        placement: "right",
        text: "Un nouveau problème illustré est proposé chaque jour. C'est un bon point de départ quand vous cherchez quoi résoudre."
      },
      {
        target: "progress",
        placement: "left",
        text: "La progression indique combien de problèmes vous avez résolus dans chaque domaine."
      },
      {
        target: "recommendations",
        placement: "right",
        text: "Les recommandations tiennent compte de votre niveau et de vos préférences. Vos retours sur la difficulté et sur les problèmes appréciés les rendent plus précises."
      },
      {
        target: "tip",
        placement: "right",
        text: "Chaque jour, un conseil ou une méthode présente une façon de mieux aborder les mathématiques, avec des problèmes pour s'entraîner."
      },
      {
        target: "friends",
        placement: "left",
        text: "Cette partie rassemble les contributions récentes de vos amis."
      },
      {
        target: "chat",
        placement: "left",
        text: "Vous pouvez aussi discuter avec vos amis et voir qui est en ligne."
      },
      {
        target: "nav-problems",
        placement: "bottom",
        action: "open-problems",
        text: "Cliquez sur Problèmes pour ouvrir la bibliothèque du site."
      },
      {
        target: "problem-browser",
        placement: "right",
        text: "Cette page rassemble les problèmes publiés. Vous pouvez les filtrer et choisir une difficulté adaptée."
      },
      {
        target: "open-problem",
        placement: "bottom",
        action: "open-problem",
        text: "Les problèmes recommandés apparaissent aussi ici. Ouvrez celui-ci pour voir sa page."
      },
      {
        target: "statement",
        placement: "right",
        text: "La page présente l'énoncé et les actions principales. Vous pouvez commencer un travail, indiquer que vous avez résolu le problème ou l'ajouter à vos favoris."
      },
      {
        target: "help",
        placement: "right",
        text: "Des indications et des solutions peuvent vous aider. Les problèmes, concepts, traductions et solutions sont rédigés par la communauté et peuvent être complétés."
      },
      {
        target: "nav-concepts",
        placement: "bottom",
        text: "La page Concepts forme une encyclopédie mathématique. Chaque concept peut contenir une définition, des exemples et des exercices d'application."
      },
      {
        target: "nav-users",
        placement: "bottom",
        text: "La page Utilisateurs permet de découvrir les membres, leurs contributions et leur activité sur le site."
      },
      {
        text: "Vous connaissez maintenant les principales parties de Math Woods. Vous pouvez parcourir librement les problèmes, les concepts et les contributions de la communauté."
      },
      {
        target: "menu",
        placement: "left",
        action: "finish",
        text: "Le menu donne accès aux suggestions. Vous pouvez y signaler un bug ou proposer une amélioration à l'équipe du site."
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
    finish: "Finish",
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
        text: "Welcome to Math Woods. This tour presents the main parts of the site using a demonstration page."
      },
      {
        text: "Math Woods is an open-source site for learning mathematics at every level. Anyone can solve problems, explain concepts, and share ideas at their own pace."
      },
      {
        target: "daily",
        placement: "right",
        text: "A new illustrated problem is featured every day. It is a useful place to start when you are looking for something to solve."
      },
      {
        target: "progress",
        placement: "left",
        text: "Your progress shows how many problems you have solved in each area."
      },
      {
        target: "recommendations",
        placement: "right",
        text: "Recommendations reflect your level and preferences. Feedback on difficulty and the problems you enjoyed makes them more accurate."
      },
      {
        target: "tip",
        placement: "right",
        text: "A daily tip or method offers another way to approach mathematics, with related problems for practice."
      },
      {
        target: "friends",
        placement: "left",
        text: "This section gathers your friends' recent contributions."
      },
      {
        target: "chat",
        placement: "left",
        text: "You can also chat with friends and see who is online."
      },
      {
        target: "nav-problems",
        placement: "bottom",
        action: "open-problems",
        text: "Select Problems to open the site's problem library."
      },
      {
        target: "problem-browser",
        placement: "right",
        text: "This page gathers published problems. You can filter them and choose a suitable difficulty."
      },
      {
        target: "open-problem",
        placement: "bottom",
        action: "open-problem",
        text: "Recommended problems also appear here. Open this one to view its page."
      },
      {
        target: "statement",
        placement: "right",
        text: "The page contains the statement and main actions. You can start working, mark the problem as solved, or add it to your favorites."
      },
      {
        target: "help",
        placement: "right",
        text: "Hints and solutions can help you. Problems, concepts, translations, and solutions are written by the community and can be expanded."
      },
      {
        target: "nav-concepts",
        placement: "bottom",
        text: "Concepts form a mathematical encyclopedia. Each page can include a definition, examples, and practice exercises."
      },
      {
        target: "nav-users",
        placement: "bottom",
        text: "The Users page lets you discover members, their contributions, and their activity on the site."
      },
      {
        text: "You now know the main parts of Math Woods. You can freely browse problems, concepts, and community contributions."
      },
      {
        target: "menu",
        placement: "left",
        action: "finish",
        text: "The menu includes Suggestions. You can use it to report a bug or share an improvement with the team."
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
