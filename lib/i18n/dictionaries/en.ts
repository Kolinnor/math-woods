export const en = {
  common: {
    difficultyUnset: "unset",
    publicDomain: "public domain"
  },
  nav: {
    homeAriaLabel: "Math Woods home",
    problems: "Problems",
    concepts: "Concepts",
    playlists: "Playlists",
    tips: "Tips",
    users: "Users",
    searchAriaLabel: "Search Math Woods",
    searchPlaceholder: "Search",
    moreAriaLabel: "Open navigation menu",
    moreTitle: "More",
    recentChanges: "Recent changes",
    contributing: "Contributing",
    suggestions: "Suggestions",
    about: "About",
    settings: "Settings",
    moderation: "Moderation",
    signOut: "Sign out",
    signIn: "Sign in",
    updatingResults: "Updating results"
  },
  footer: {
    legal:
      "Code: AGPL-3.0-or-later. Educational content: CC BY-NC-SA 4.0 unless otherwise stated. Math Woods name, logo, domain, and visual identity are protected brand assets.",
    about: "About",
    suggestions: "Suggestions",
    contribute: "Contribute"
  },
  home: {
    hero: {
      welcomeBack: (name: string) => `Welcome back, ${name}`,
      resume: (title: string) => `Resume: ${title}`,
      findLevel: "Find a problem at my level",
      guestTitle: "Math Woods is a quiet place for problem solving and studying mathematics",
      startSolving: "Start solving problems",
      contributeQuestion: "How can I contribute?",
      artCredit: "Ivan Shishkin, Morning in a Pine Forest (1889) / public domain"
    },
    trail: {
      ariaLabel: "How Math Woods works",
      items: [
        "Problems are written and curated by the community.",
        "Each problem connects to an evolving database of mathematical concepts.",
        "The site is free and open source. Feel free to contribute!"
      ]
    },
    tip: {
      title: "Tip of the day",
      practice: "Practice this tip"
    },
    problemToTry: {
      title: "Problem to try",
      allProblems: "all problems",
      empty: "No problems yet.",
      attempts: (count: number) => `${count} ${count === 1 ? "attempt" : "attempts"}`,
      favorites: (count: number) => `${count} ${count === 1 ? "favorite" : "favorites"}`,
      difficultyLine: (difficulty: number | null, attempts: string, favorites: string) =>
        `difficulty ${difficulty ?? "unset"}/100 / ${attempts} / ${favorites}`
    },
    domainLabels: {
      ALGEBRA: "Algebra",
      ANALYSIS: "Analysis",
      ARITHMETIC: "Number theory",
      GEOMETRY: "Geometry",
      COMBINATORICS: "Combinatorics",
      PROBABILITY: "Probability",
      TOPOLOGY: "Topology",
      LOGIC: "Logic",
      OTHER: "Other"
    },
    domains: {
      title: "Browse by domain",
      items: [
        { label: "Algebra", domain: "algebra" },
        { label: "Real analysis", domain: "real-analysis" },
        { label: "Number theory", domain: "number-theory" },
        { label: "Geometry", domain: "geometry" },
        { label: "Combinatorics", domain: "combinatorics" },
        { label: "Probability and statistics", domain: "probability-statistics" },
        { label: "General topology", domain: "general-topology" },
        { label: "More...", href: "/problems" }
      ]
    },
    recent: {
      title: "Recently added",
      browseAll: "browse all",
      cardMeta: (difficulty: number | null, author: string) => `difficulty ${difficulty ?? "unset"} / by ${author}`,
      curator: "curator"
    },
    cta: {
      title: "Every problem is a trail. Pick one and go a little deeper.",
      action: "Find a problem at my level",
      artCredit: "Ivan Shishkin, Pine Forest / public domain"
    },
    footer: {
      legal:
        "Code: AGPL-3.0-or-later. Educational content: CC BY-NC-SA 4.0 unless otherwise stated. Artwork by Ivan Shishkin (1832-1898), public domain via Wikimedia Commons. Math Woods name, logo, and visual identity are protected brand assets.",
      about: "About",
      suggestions: "Suggestions",
      contribute: "Contribute"
    }
  }
} as const;
