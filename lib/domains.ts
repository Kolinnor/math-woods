import { MathDomain } from "@prisma/client";

export type DomainOption = {
  value: string;
  label: string;
  domain: MathDomain;
  aliases?: string[];
  children?: DomainOption[];
};

function option(value: string, label: string, domain: MathDomain, aliases: string[] = []): DomainOption {
  return { value, label, domain, aliases };
}

function msc(code: string, label: string, domain: MathDomain): DomainOption {
  return option(`${code}-XX`, label, domain, [code]);
}

export const MATH_DOMAINS: DomainOption[] = [
  {
    value: MathDomain.LOGIC,
    label: "General, foundations, education",
    domain: MathDomain.LOGIC,
    children: [
      msc("00", "General and overarching topics; collections", MathDomain.OTHER),
      msc("01", "History and biography", MathDomain.OTHER),
      msc("03", "Mathematical logic and foundations", MathDomain.LOGIC),
      msc("97", "Mathematics education", MathDomain.OTHER)
    ]
  },
  {
    value: MathDomain.COMBINATORICS,
    label: "Discrete mathematics and computer science",
    domain: MathDomain.COMBINATORICS,
    children: [
      msc("05", "Combinatorics", MathDomain.COMBINATORICS),
      msc("68", "Computer science", MathDomain.COMBINATORICS),
      msc("90", "Operations research, mathematical programming", MathDomain.COMBINATORICS),
      msc("94", "Information and communication theory, circuits", MathDomain.COMBINATORICS)
    ]
  },
  {
    value: MathDomain.ALGEBRA,
    label: "Algebra and number theory",
    domain: MathDomain.ALGEBRA,
    children: [
      msc("06", "Order, lattices, ordered algebraic structures", MathDomain.ALGEBRA),
      msc("08", "General algebraic systems", MathDomain.ALGEBRA),
      msc("11", "Number theory", MathDomain.ARITHMETIC),
      msc("12", "Field theory and polynomials", MathDomain.ALGEBRA),
      msc("13", "Commutative algebra", MathDomain.ALGEBRA),
      msc("14", "Algebraic geometry", MathDomain.ALGEBRA),
      msc("15", "Linear and multilinear algebra; matrix theory", MathDomain.ALGEBRA),
      msc("16", "Associative rings and algebras", MathDomain.ALGEBRA),
      msc("17", "Nonassociative rings and algebras", MathDomain.ALGEBRA),
      msc("18", "Category theory; homological algebra", MathDomain.ALGEBRA),
      msc("19", "K-theory", MathDomain.ALGEBRA),
      msc("20", "Group theory and generalizations", MathDomain.ALGEBRA),
      msc("22", "Topological groups, Lie groups", MathDomain.ALGEBRA)
    ]
  },
  {
    value: MathDomain.ANALYSIS,
    label: "Analysis",
    domain: MathDomain.ANALYSIS,
    children: [
      msc("26", "Real functions", MathDomain.ANALYSIS),
      msc("28", "Measure and integration", MathDomain.ANALYSIS),
      msc("30", "Functions of a complex variable", MathDomain.ANALYSIS),
      msc("31", "Potential theory", MathDomain.ANALYSIS),
      msc("32", "Several complex variables and analytic spaces", MathDomain.ANALYSIS),
      msc("33", "Special functions", MathDomain.ANALYSIS),
      msc("34", "Ordinary differential equations", MathDomain.ANALYSIS),
      msc("35", "Partial differential equations", MathDomain.ANALYSIS),
      msc("37", "Dynamical systems and ergodic theory", MathDomain.ANALYSIS),
      msc("39", "Difference and functional equations", MathDomain.ANALYSIS),
      msc("40", "Sequences, series, summability", MathDomain.ANALYSIS),
      msc("41", "Approximations and expansions", MathDomain.ANALYSIS),
      msc("42", "Harmonic analysis on Euclidean spaces", MathDomain.ANALYSIS),
      msc("43", "Abstract harmonic analysis", MathDomain.ANALYSIS),
      msc("44", "Integral transforms, operational calculus", MathDomain.ANALYSIS),
      msc("45", "Integral equations", MathDomain.ANALYSIS),
      msc("46", "Functional analysis", MathDomain.ANALYSIS),
      msc("47", "Operator theory", MathDomain.ANALYSIS),
      msc("49", "Calculus of variations and optimal control; optimization", MathDomain.ANALYSIS)
    ]
  },
  {
    value: MathDomain.GEOMETRY,
    label: "Geometry and topology",
    domain: MathDomain.GEOMETRY,
    children: [
      msc("51", "Geometry", MathDomain.GEOMETRY),
      msc("52", "Convex and discrete geometry", MathDomain.GEOMETRY),
      msc("53", "Differential geometry", MathDomain.GEOMETRY),
      msc("54", "General topology", MathDomain.TOPOLOGY),
      msc("55", "Algebraic topology", MathDomain.TOPOLOGY),
      msc("57", "Manifolds and cell complexes", MathDomain.TOPOLOGY),
      msc("58", "Global analysis, analysis on manifolds", MathDomain.GEOMETRY)
    ]
  },
  {
    value: MathDomain.PROBABILITY,
    label: "Probability and statistics",
    domain: MathDomain.PROBABILITY,
    children: [
      msc("60", "Probability theory and stochastic processes", MathDomain.PROBABILITY),
      msc("62", "Statistics", MathDomain.PROBABILITY)
    ]
  },
  {
    value: MathDomain.OTHER,
    label: "Applied and other mathematics",
    domain: MathDomain.OTHER,
    children: [
      msc("65", "Numerical analysis", MathDomain.OTHER),
      msc("70", "Mechanics of particles and systems", MathDomain.OTHER),
      msc("74", "Mechanics of deformable solids", MathDomain.OTHER),
      msc("76", "Fluid mechanics", MathDomain.OTHER),
      msc("78", "Optics, electromagnetic theory", MathDomain.OTHER),
      msc("80", "Classical thermodynamics, heat transfer", MathDomain.OTHER),
      msc("81", "Quantum theory", MathDomain.OTHER),
      msc("82", "Statistical mechanics, structure of matter", MathDomain.OTHER),
      msc("83", "Relativity and gravitational theory", MathDomain.OTHER),
      msc("85", "Astronomy and astrophysics", MathDomain.OTHER),
      msc("86", "Geophysics", MathDomain.OTHER),
      msc("91", "Game theory, economics, finance, and other social and behavioral sciences", MathDomain.OTHER),
      msc("92", "Biology and other natural sciences", MathDomain.OTHER),
      msc("93", "Systems theory; control", MathDomain.OTHER)
    ]
  }
];

export const FLAT_DOMAIN_OPTIONS = MATH_DOMAINS.flatMap((domain) => [domain, ...(domain.children ?? [])]);

export type ProblemDomainFamily = "found" | "geom" | "ana" | "prob" | "app" | "other";

export type ProblemDomainOption = DomainOption & {
  glyph: string;
  family: ProblemDomainFamily;
  diff: number;
  year: number;
};

export const PROBLEM_DOMAIN_FAMILIES: Record<ProblemDomainFamily, { label: string; color: string; order: number }> = {
  found: { label: "Foundations & algebra", color: "#3f6b45", order: 0 },
  geom: { label: "Geometry & topology", color: "#a87f2e", order: 1 },
  ana: { label: "Analysis", color: "#2f6f6a", order: 2 },
  prob: { label: "Probability & discrete math", color: "#3d5f7a", order: 3 },
  app: { label: "Applied mathematics", color: "#a13a3a", order: 4 },
  other: { label: "Other", color: "#1f1f1f", order: 5 }
};

function problemDomain(
  value: string,
  label: string,
  domain: MathDomain,
  glyph: string,
  family: ProblemDomainFamily,
  diff: number,
  year: number,
  aliases: string[] = []
): ProblemDomainOption {
  return { ...option(value, label, domain, aliases), glyph, family, diff, year };
}

function withSubdomains(
  domain: ProblemDomainOption,
  entries: Array<[value: string, label: string, aliases?: string[]]>
): ProblemDomainOption {
  const children = entries
    .map(([value, label, aliases = []]) => option(value, label, domain.domain, aliases))
    .sort((left, right) => left.label.localeCompare(right.label, "en"));

  return { ...domain, children };
}

export const PROBLEM_DOMAINS: ProblemDomainOption[] = [
  withSubdomains(
    problemDomain("logic", "Mathematical formalism", MathDomain.LOGIC, "⊢", "found", 2, 1847, [MathDomain.LOGIC, "03", "03-XX"]),
    [
      ["logic-mathematical-logic", "Mathematical logic"],
      ["logic-model-theory", "Model theory"],
      ["logic-set-theory", "Set theory"]
    ]
  ),
  problemDomain("category-theory", "Category theory", MathDomain.ALGEBRA, "→", "found", 4, 1945, ["18", "18-XX"]),
  withSubdomains(
    problemDomain("algebra", "General algebra", MathDomain.ALGEBRA, "x", "found", 2, 820, [MathDomain.ALGEBRA, "06", "06-XX", "08", "08-XX", "12", "12-XX", "13", "13-XX", "16", "16-XX", "17", "17-XX", "19", "19-XX", "22", "22-XX"]),
    [
      ["algebra-group-actions", "Group action"],
      ["algebra-fields", "Field"],
      ["algebra-galois-theory", "Galois theory"],
      ["algebra-groups", "Group"],
      ["algebra-modules", "Module"],
      ["algebra-rings", "Ring"]
    ]
  ),
  withSubdomains(
    problemDomain("linear-algebra", "Linear algebra", MathDomain.ALGEBRA, "▦", "found", 2, 1850, ["15", "15-XX"]),
    [
      ["linear-algebra-euclidean-spaces", "Euclidean vector space"],
      ["linear-algebra-hilbert-spaces", "Hilbert and pre-Hilbert space"],
      ["linear-algebra-lie-algebras", "Lie algebra"],
      ["linear-algebra-endomorphism-reduction", "Reduction of endomorphism"],
      ["linear-algebra-polynomial", "Polynomial"],
      ["linear-algebra-representations-characters", "Representation and character"]
    ]
  ),
  withSubdomains(
    problemDomain("geometry", "Geometry", MathDomain.GEOMETRY, "△", "geom", 2, -300, [MathDomain.GEOMETRY, "51", "51-XX", "52", "52-XX"]),
    [["geometry-non-euclidean-geometry", "Non-euclidean geometry"]]
  ),
  withSubdomains(
    problemDomain("differential-geometry", "Differential geometry", MathDomain.GEOMETRY, "∂", "geom", 4, 1827, ["53", "53-XX", "58", "58-XX"]),
    [["differential-geometry-de-rham-cohomology", "De Rham cohomology"]]
  ),
  withSubdomains(
    problemDomain("general-topology", "Topology", MathDomain.TOPOLOGY, "🥔", "geom", 3, 1895, [MathDomain.TOPOLOGY, "54", "54-XX", "57", "57-XX"]),
    [
      ["topology-compact-sets", "Compact set"],
      ["topology-connectedness", "Connectedness"],
      ["topology-metric-spaces", "Metric space"],
      ["topology-normed-vector-spaces", "Normed vector space"]
    ]
  ),
  {
    ...problemDomain("algebraic-topology", "Algebraic topology", MathDomain.TOPOLOGY, "π₁", "geom", 4, 1895, ["topology-algebraic-topology", "55", "55-XX"]),
    children: [
      option("algebraic-geometry", "Algebraic geometry", MathDomain.ALGEBRA, ["14", "14-XX"]),
      option("algebraic-topology-fundamental-group", "Fundamental group", MathDomain.TOPOLOGY),
      option("algebraic-topology-homology-cohomology", "Homology/Cohomology", MathDomain.TOPOLOGY),
      option("topology-riemann-surfaces", "Riemann surface", MathDomain.TOPOLOGY)
    ]
  },
  withSubdomains(
    problemDomain("real-analysis", "Real analysis", MathDomain.ANALYSIS, "ℝ", "ana", 3, 1700, [MathDomain.ANALYSIS, "26", "26-XX", "28", "28-XX", "40", "40-XX"]),
    [
      ["real-analysis-continuity", "Continuity and uniform continuity"],
      ["real-analysis-differentiation", "Differentiation"],
      ["real-analysis-power-series", "Power series"],
      ["real-analysis-real-functions", "Real function"],
      ["real-analysis-riemann-integration", "Riemann integration"],
      ["real-analysis-sequences-series", "Sequence and series"],
      ["real-analysis-sequences-series-functions", "Sequence and series of function"]
    ]
  ),
  withSubdomains(
    problemDomain("functional-analysis", "Functional analysis", MathDomain.ANALYSIS, "ƒ", "ana", 4, 1900, ["46", "46-XX", "47", "47-XX"]),
    [
      ["multivariable-analysis-distributions", "Distribution"],
      ["multivariable-analysis-functional-analysis", "Functional analysis"],
      ["multivariable-analysis-lebesgue-integration", "Lebesgue integration"],
      ["multivariable-analysis-measure-theory", "Measure theory"]
    ]
  ),
  withSubdomains(
    problemDomain("complex-analysis", "Complex analysis", MathDomain.ANALYSIS, "ℂ", "ana", 3, 1825, ["30", "30-XX", "31", "31-XX", "32", "32-XX"]),
    [
      ["complex-analysis-holomorphism", "Holomorphism"],
      ["real-analysis-fourier-series", "Fourier series"]
    ]
  ),
  withSubdomains(
    problemDomain("several-variable-functions", "Function of several variables", MathDomain.ANALYSIS, "ℝᵈ", "ana", 3, 1800),
    [
      ["multivariable-analysis-differentiation", "Differential"],
      ["multivariable-analysis-fourier-integration", "Fourier transform"]
    ]
  ),
  withSubdomains(
    problemDomain("differential-equations", "Differential equation", MathDomain.ANALYSIS, "∇", "ana", 3, 1690, ["34", "34-XX", "35", "35-XX", "37", "37-XX", "39", "39-XX"]),
    [
      ["differential-equations-ordinary", "Ordinary differential equation"],
      ["differential-equations-partial", "Partial differential equation"]
    ]
  ),
  withSubdomains(
    problemDomain("probability-statistics", "Probability and statistics", MathDomain.PROBABILITY, "ℙ", "prob", 2, 1654, [MathDomain.PROBABILITY, "60", "60-XX", "62", "62-XX"]),
    [
      ["probability-finite-spaces", "Probability on finite space"],
      ["probability-game-theory", "Game theory"],
      ["probability-random-variables", "Random variable"],
      ["probability-statistical-methods", "Statistics"],
      ["probability-stochastic-processes", "Stochastic process"]
    ]
  ),
  {
    ...problemDomain("graphs-discrete-math", "Discrete mathematics", MathDomain.COMBINATORICS, "Σ", "prob", 2, 1736, [MathDomain.COMBINATORICS, "68", "68-XX", "90", "90-XX", "94", "94-XX"]),
    children: [
      option("combinatorics", "Combinatorics", MathDomain.COMBINATORICS, ["05", "05-XX", "discrete-mathematics-combinatorics"]),
      option("discrete-mathematics-discrete-analysis", "Discrete analysis", MathDomain.COMBINATORICS),
      option("discrete-mathematics-graph-theory", "Graph theory", MathDomain.COMBINATORICS),
      option("number-theory", "Number theory", MathDomain.ARITHMETIC, [MathDomain.ARITHMETIC, "11", "11-XX"])
    ]
  },
  withSubdomains(
    problemDomain("computation", "Computation", MathDomain.ALGEBRA, "√", "app", 2, 1000),
    [
      ["computation-asymptotics", "Asymptotic analysis"],
      ["computation-equation-solving", "Equation solving"],
      ["computation-inequalities", "Inequality"]
    ]
  ),
  problemDomain("history-of-mathematics", "History of mathematics", MathDomain.OTHER, "𓀞", "app", 1, -600, ["01", "01-XX"]),
  withSubdomains(
    problemDomain("other", "Applied mathematics", MathDomain.OTHER, "💻", "app", 1, 9999, [MathDomain.OTHER, "00", "00-XX", "33", "33-XX", "41", "41-XX", "42", "42-XX", "43", "43-XX", "44", "44-XX", "45", "45-XX", "49", "49-XX", "85", "85-XX", "86", "86-XX", "91", "91-XX", "92", "92-XX", "93", "93-XX", "97", "97-XX"]),
    [
      ["other-biology", "Biology"],
      ["other-chemistry", "Chemistry"],
      ["other-computing", "Computing"],
      ["other-physics", "Physics"],
      ["other-real-world-problem", "Real-world problem"]
    ]
  ),
  problemDomain("enigma", "Enigma", MathDomain.OTHER, "?", "other", 1, 9999),
  problemDomain("misc", "Other", MathDomain.OTHER, "...", "other", 1, 9999)
];

export const FLAT_PROBLEM_DOMAIN_OPTIONS = PROBLEM_DOMAINS.flatMap((domain) => [domain, ...(domain.children ?? [])]);

const DOMAIN_DESCRIPTIONS: Partial<Record<string, string>> = {
  [MathDomain.COMBINATORICS]:
    "Problems about finite and discrete structures, including counting, configurations, graphs, algorithms, and information-theoretic viewpoints.",
  "combinatorics":
    "Combinatorics studies discrete arrangements and finite structures: counting, extremal questions, graphs, designs, and related configurations.",
  [MathDomain.ALGEBRA]:
    "Problems about algebraic structures and number-theoretic objects, from equations and matrices to groups, rings, fields, and categories.",
  "linear-algebra":
    "Linear and multilinear algebra focuses on vector spaces, linear maps, matrices, determinants, eigenvalues, and tensor-like constructions."
};

export function findDomainOption(value: string | MathDomain | null | undefined) {
  if (!value) return undefined;
  const raw = String(value).trim();
  const normalized = raw.toUpperCase().replace(/\s+/g, "_");
  const options = [...FLAT_PROBLEM_DOMAIN_OPTIONS, ...FLAT_DOMAIN_OPTIONS];

  const codeMatch = options.find((item) => {
    const itemValue = item.value.toUpperCase();
    const aliases = item.aliases?.map((alias) => alias.toUpperCase()) ?? [];
    return itemValue === normalized || aliases.includes(normalized);
  });
  if (codeMatch) return codeMatch;

  return options.find((item) => item.label.toLowerCase() === raw.toLowerCase());
}

export function domainLabel(domain: MathDomain | string) {
  return findDomainOption(domain)?.label ?? "Other";
}

export function parentProblemDomainForCode(value: string | MathDomain | null | undefined) {
  const option = findDomainOption(value);
  if (!option) return undefined;

  return PROBLEM_DOMAINS.find(
    (domain) => domain.value === option.value || domain.children?.some((child) => child.value === option.value)
  );
}

export function translatedDomainLabel(
  domain: MathDomain | string,
  labels: Partial<Record<string, string>>
) {
  const option = findDomainOption(domain);
  if (!option) return labels[MathDomain.OTHER] ?? "Other";
  const parent = parentProblemDomainForCode(option.value);
  if (parent && parent.value !== option.value) {
    return labels[option.value] ?? option.label;
  }
  return labels[option.value] ?? labels[option.domain] ?? option.label;
}

export function translatedDomainOptions<T extends DomainOption>(
  domains: readonly T[],
  labels: Partial<Record<string, string>>
): T[] {
  return domains.map((domain) => ({
    ...domain,
    label: translatedDomainLabel(domain.value, labels),
    ...(domain.children
      ? { children: translatedDomainOptions(domain.children, labels) }
      : {})
  })) as T[];
}

export function domainDescription(domain: MathDomain | string | null | undefined) {
  const option = findDomainOption(domain);
  if (!option) return null;
  return DOMAIN_DESCRIPTIONS[option.value] ?? `Problems in ${option.label.toLowerCase()}.`;
}

export function coarseDomainForCode(value: string | MathDomain | null | undefined): MathDomain {
  const option = findDomainOption(value);
  if (option) return option.domain;

  const input = String(value ?? "").toUpperCase() as MathDomain;
  return Object.values(MathDomain).includes(input) ? input : MathDomain.OTHER;
}

export function parseMathDomain(value: FormDataEntryValue | null): MathDomain {
  return coarseDomainForCode(String(value ?? ""));
}

export function parseDomainCode(value: FormDataEntryValue | string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return findDomainOption(MathDomain.OTHER)?.value ?? MathDomain.OTHER;
  return findDomainOption(raw)?.value ?? findDomainOption(MathDomain.OTHER)?.value ?? MathDomain.OTHER;
}

export function domainCodeAliases(value: string | MathDomain | null | undefined) {
  const option = findDomainOption(value);
  return option
    ? [
        option.value,
        ...(option.aliases ?? []),
        ...(option.children?.flatMap((child) => [child.value, ...(child.aliases ?? [])]) ?? [])
      ]
    : [String(value ?? "")].filter(Boolean);
}
