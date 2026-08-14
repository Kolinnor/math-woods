import { ProblemStyle } from "@prisma/client";

type ProblemStyleCopy = {
  en: string;
  fr: string;
  slug: string;
};

export const PROBLEM_STYLE_COPY: Record<ProblemStyle, ProblemStyleCopy> = {
  PROOF: { en: "Proof", fr: "Démonstration", slug: "proof" },
  CALCULATION: { en: "Calculation", fr: "Calcul", slug: "calculation" },
  CONSTRUCTION: { en: "Construction", fr: "Construction", slug: "construction" },
  COUNTEREXAMPLE: { en: "Counterexample", fr: "Contre-exemple", slug: "counterexample" },
  CLASSIFICATION: { en: "Classification", fr: "Classification", slug: "classification" },
  OPTIMIZATION: { en: "Optimization", fr: "Optimisation", slug: "optimization" },
  VISUAL: { en: "Visual", fr: "Visuel", slug: "visual" },
  ALGORITHMIC: { en: "Algorithmic", fr: "Algorithmique", slug: "algorithmic" },
  PUZZLE: { en: "Puzzle", fr: "Énigme", slug: "puzzle" },
  TRICK_QUESTION: { en: "Trick question", fr: "Question piège", slug: "trick-question" },
  MULTIPLE_APPROACHES: { en: "Multiple approaches", fr: "Plusieurs approches", slug: "multiple-approaches" }
};

export const PROBLEM_STYLE_OPTIONS = Object.values(ProblemStyle);

export function problemStyleLabel(style: ProblemStyle, locale: string) {
  return locale.toLowerCase().startsWith("fr") ? PROBLEM_STYLE_COPY[style].fr : PROBLEM_STYLE_COPY[style].en;
}

export function parseProblemStyle(value: unknown): ProblemStyle | null {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!normalized) return null;
  return PROBLEM_STYLE_OPTIONS.find((style) => {
    const copy = PROBLEM_STYLE_COPY[style];
    return style.toLowerCase().replaceAll("_", "-") === normalized ||
      copy.slug === normalized ||
      copy.en.toLowerCase().replaceAll(" ", "-") === normalized ||
      copy.fr.toLowerCase().replaceAll(" ", "-") === normalized;
  }) ?? null;
}

export function parseProblemStyles(values: readonly FormDataEntryValue[]) {
  return [...new Set(values.map(parseProblemStyle).filter((style): style is ProblemStyle => Boolean(style)))];
}

export function problemStylesFromLegacyTagSlugs(slugs: readonly string[]) {
  return [...new Set(slugs.map(parseProblemStyle).filter((style): style is ProblemStyle => Boolean(style)))];
}
