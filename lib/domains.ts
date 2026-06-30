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
  found: { label: "Fondements & algèbre", color: "#3f6b45", order: 0 },
  geom: { label: "Géométrie & topologie", color: "#a87f2e", order: 1 },
  ana: { label: "Analyse", color: "#2f6f6a", order: 2 },
  prob: { label: "Probabilités & discret", color: "#3d5f7a", order: 3 },
  app: { label: "Maths appliquées", color: "#a85f33", order: 4 },
  other: { label: "Autres", color: "#1f1f1f", order: 5 }
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

export const PROBLEM_DOMAINS: ProblemDomainOption[] = [
  problemDomain(MathDomain.LOGIC, "Logique", MathDomain.LOGIC, "∴", "found", 2, 1847, ["03", "03-XX"]),
  problemDomain("18-XX", "Catégories", MathDomain.ALGEBRA, "→", "found", 4, 1945, ["18"]),
  problemDomain(MathDomain.ALGEBRA, "Algèbre", MathDomain.ALGEBRA, "x", "found", 2, 820, ["06", "06-XX", "08", "08-XX", "12", "12-XX", "13", "13-XX", "16", "16-XX", "17", "17-XX", "19", "19-XX", "22", "22-XX"]),
  problemDomain("15-XX", "Algèbre linéaire", MathDomain.ALGEBRA, "⊕", "found", 2, 1850, ["15"]),
  problemDomain("11-XX", "Théorie des nombres", MathDomain.ARITHMETIC, "ℤ", "found", 3, -300, ["11", MathDomain.ARITHMETIC]),
  problemDomain("20-XX", "Théorie des représentations", MathDomain.ALGEBRA, "ρ", "found", 4, 1896, ["20"]),
  problemDomain("14-XX", "Géométrie algébrique", MathDomain.ALGEBRA, "⊙", "geom", 4, 1900, ["14"]),
  problemDomain("51-XX", "Géométrie", MathDomain.GEOMETRY, "△", "geom", 2, -300, [MathDomain.GEOMETRY, "51", "52", "52-XX"]),
  problemDomain("53-XX", "Géométrie différentielle", MathDomain.GEOMETRY, "∂", "geom", 4, 1827, ["53", "58", "58-XX"]),
  problemDomain("54-XX", "Topologie", MathDomain.TOPOLOGY, "∞", "geom", 3, 1895, [MathDomain.TOPOLOGY, "54", "57", "57-XX"]),
  problemDomain("55-XX", "Topologie algébrique", MathDomain.TOPOLOGY, "π", "geom", 4, 1900, ["55"]),
  problemDomain("26-XX", "Analyse réelle", MathDomain.ANALYSIS, "ℝ", "ana", 3, 1700, ["26", MathDomain.ANALYSIS, "28", "28-XX", "40", "40-XX"]),
  problemDomain("30-XX", "Analyse complexe", MathDomain.ANALYSIS, "ℂ", "ana", 3, 1825, ["30", "31", "31-XX", "32", "32-XX"]),
  problemDomain("46-XX", "Analyse fonctionnelle", MathDomain.ANALYSIS, "ƒ", "ana", 4, 1900, ["46", "47", "47-XX"]),
  problemDomain("34-XX", "Équations différentielles", MathDomain.ANALYSIS, "∇", "ana", 3, 1690, ["34", "35", "35-XX", "37", "37-XX", "39", "39-XX"]),
  problemDomain(MathDomain.PROBABILITY, "Probabilités et statistiques", MathDomain.PROBABILITY, "ℙ", "prob", 2, 1654, ["60", "60-XX", "62", "62-XX"]),
  problemDomain("05-XX", "Combinatoire", MathDomain.COMBINATORICS, "∑", "prob", 2, 1666, ["05"]),
  problemDomain(MathDomain.COMBINATORICS, "Graphes et discret", MathDomain.COMBINATORICS, "◇", "prob", 2, 1736, ["68", "68-XX", "90", "90-XX", "94", "94-XX"]),
  problemDomain("65-XX", "Calcul scientifique", MathDomain.OTHER, "≈", "app", 3, 1947, ["65"]),
  problemDomain("81-XX", "Physique mathématique", MathDomain.OTHER, "Ψ", "app", 3, 1687, ["70", "70-XX", "74", "74-XX", "76", "76-XX", "78", "78-XX", "80", "80-XX", "81", "82", "82-XX", "83", "83-XX"]),
  problemDomain(MathDomain.OTHER, "Autres", MathDomain.OTHER, "⋯", "other", 1, 9999, ["00", "00-XX", "01", "01-XX", "33", "33-XX", "41", "41-XX", "42", "42-XX", "43", "43-XX", "44", "44-XX", "45", "45-XX", "49", "49-XX", "85", "85-XX", "86", "86-XX", "91", "91-XX", "92", "92-XX", "93", "93-XX", "97", "97-XX"])
];

export const FLAT_PROBLEM_DOMAIN_OPTIONS = PROBLEM_DOMAINS;

const DOMAIN_DESCRIPTIONS: Partial<Record<string, string>> = {
  [MathDomain.COMBINATORICS]:
    "Problems about finite and discrete structures, including counting, configurations, graphs, algorithms, and information-theoretic viewpoints.",
  "05-XX":
    "Combinatorics studies discrete arrangements and finite structures: counting, extremal questions, graphs, designs, and related configurations.",
  [MathDomain.ALGEBRA]:
    "Problems about algebraic structures and number-theoretic objects, from equations and matrices to groups, rings, fields, and categories.",
  "15-XX":
    "Linear and multilinear algebra focuses on vector spaces, linear maps, matrices, determinants, eigenvalues, and tensor-like constructions."
};

export function findDomainOption(value: string | MathDomain | null | undefined) {
  if (!value) return undefined;
  const raw = String(value).trim();
  const normalized = raw.toUpperCase().replace(/\s+/g, "_");

  return [...FLAT_PROBLEM_DOMAIN_OPTIONS, ...FLAT_DOMAIN_OPTIONS].find((item) => {
    const itemValue = item.value.toUpperCase();
    const aliases = item.aliases?.map((alias) => alias.toUpperCase()) ?? [];
    return (
      itemValue === normalized ||
      aliases.includes(normalized) ||
      item.label.toLowerCase() === raw.toLowerCase()
    );
  });
}

export function domainLabel(domain: MathDomain | string) {
  return findDomainOption(domain)?.label ?? "Other";
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
  if (!raw) return MathDomain.OTHER;
  return findDomainOption(raw)?.value ?? MathDomain.OTHER;
}

export function domainCodeAliases(value: string | MathDomain | null | undefined) {
  const option = findDomainOption(value);
  return option ? [option.value, ...(option.aliases ?? [])] : [String(value ?? "")].filter(Boolean);
}
