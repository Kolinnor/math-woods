import type { DeepPartial, Dictionary } from "../types.ts";

export const fr = {
  common: {
    difficultyUnset: "non définie",
    publicDomain: "domaine public"
  },
  nav: {
    homeAriaLabel: "Accueil de Math Woods",
    problems: "Problèmes",
    concepts: "Concepts",
    playlists: "Parcours",
    tips: "Conseils",
    users: "Utilisateurs",
    searchAriaLabel: "Rechercher sur Math Woods",
    searchPlaceholder: "Rechercher",
    moreAriaLabel: "Ouvrir le menu de navigation",
    moreTitle: "Plus",
    recentChanges: "Modifications récentes",
    contributing: "Contribuer",
    suggestions: "Suggestions",
    about: "À propos",
    settings: "Paramètres",
    moderation: "Modération",
    signOut: "Se déconnecter",
    signIn: "Se connecter",
    updatingResults: "Mise à jour des résultats"
  },
  footer: {
    legal:
      "Code : AGPL-3.0-or-later. Contenu pédagogique : CC BY-NC-SA 4.0 sauf mention contraire. Le nom Math Woods, le logo, le domaine et l'identité visuelle sont des éléments de marque protégés.",
    about: "À propos",
    suggestions: "Suggestions",
    contribute: "Contribuer"
  },
  home: {
    hero: {
      welcomeBack: (name: string) => `Bon retour, ${name}`,
      resume: (title: string) => `Reprendre : ${title}`,
      findLevel: "Trouver un problème à mon niveau",
      guestTitle: "Math Woods est un lieu calme pour résoudre des problèmes et étudier les mathématiques",
      startSolving: "Commencer à résoudre",
      contributeQuestion: "Comment contribuer ?",
      artCredit: "Ivan Shishkin, Morning in a Pine Forest (1889) / domaine public"
    },
    trail: {
      ariaLabel: "Comment fonctionne Math Woods",
      items: [
        "Les problèmes sont écrits et sélectionnés par la communauté.",
        "Chaque problème se relie à une base de concepts mathématiques en évolution.",
        "Le site est gratuit et open source. Les contributions sont bienvenues !"
      ]
    },
    tip: {
      title: "Conseil du jour",
      practice: "S'entraîner avec ce conseil"
    },
    problemToTry: {
      title: "Problème à essayer",
      allProblems: "tous les problèmes",
      empty: "Aucun problème pour l'instant.",
      attempts: (count: number) => `${count} tentative${count > 1 ? "s" : ""}`,
      favorites: (count: number) => `${count} favori${count > 1 ? "s" : ""}`,
      difficultyLine: (difficulty: number | null, attempts: string, favorites: string) =>
        `difficulté ${difficulty ?? "non définie"}/100 / ${attempts} / ${favorites}`
    },
    domainLabels: {
      ALGEBRA: "Algèbre",
      ANALYSIS: "Analyse",
      ARITHMETIC: "Théorie des nombres",
      GEOMETRY: "Géométrie",
      COMBINATORICS: "Combinatoire",
      PROBABILITY: "Probabilités",
      TOPOLOGY: "Topologie",
      LOGIC: "Logique",
      OTHER: "Autre"
    },
    domains: {
      title: "Explorer par domaine",
      items: [
        { label: "Algèbre", domain: "algebra" },
        { label: "Analyse réelle", domain: "real-analysis" },
        { label: "Théorie des nombres", domain: "number-theory" },
        { label: "Géométrie", domain: "geometry" },
        { label: "Combinatoire", domain: "combinatorics" },
        { label: "Probabilités et statistiques", domain: "probability-statistics" },
        { label: "Topologie générale", domain: "general-topology" },
        { label: "Plus...", href: "/problems" }
      ]
    },
    recent: {
      title: "Ajouts récents",
      browseAll: "tout parcourir",
      cardMeta: (difficulty: number | null, author: string) => `difficulté ${difficulty ?? "non définie"} / par ${author}`,
      curator: "curateur"
    },
    cta: {
      title: "Chaque problème est un sentier. Choisis-en un et va un peu plus loin.",
      action: "Trouver un problème à mon niveau",
      artCredit: "Ivan Shishkin, Pine Forest / domaine public"
    },
    footer: {
      legal:
        "Code : AGPL-3.0-or-later. Contenu pédagogique : CC BY-NC-SA 4.0 sauf mention contraire. Œuvres d'Ivan Shishkin (1832-1898), domaine public via Wikimedia Commons. Le nom Math Woods, le logo et l'identité visuelle sont des éléments de marque protégés.",
      about: "À propos",
      suggestions: "Suggestions",
      contribute: "Contribuer"
    }
  }
} satisfies DeepPartial<Dictionary>;
