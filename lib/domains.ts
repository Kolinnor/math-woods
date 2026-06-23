import { MathDomain } from "@prisma/client";

export type DomainOption = {
  value: string;
  label: string;
  domain: MathDomain;
  children?: DomainOption[];
};

function option(value: string, label: string, domain: MathDomain): DomainOption {
  return { value, label, domain };
}

export const MATH_DOMAINS: DomainOption[] = [
  {
    value: MathDomain.ANALYSIS,
    label: "Analysis",
    domain: MathDomain.ANALYSIS,
    children: [
      option("26", "26 Real functions", MathDomain.ANALYSIS),
      option("28", "28 Measure and integration", MathDomain.ANALYSIS),
      option("30", "30 Complex variables", MathDomain.ANALYSIS),
      option("31", "31 Potential theory", MathDomain.ANALYSIS),
      option("32", "32 Several complex variables", MathDomain.ANALYSIS),
      option("33", "33 Special functions", MathDomain.ANALYSIS),
      option("34", "34 Ordinary differential equations", MathDomain.ANALYSIS),
      option("35", "35 Partial differential equations", MathDomain.ANALYSIS),
      option("37", "37 Dynamical systems and ergodic theory", MathDomain.ANALYSIS),
      option("39", "39 Difference and functional equations", MathDomain.ANALYSIS),
      option("40", "40 Sequences, series, summability", MathDomain.ANALYSIS),
      option("41", "41 Approximations and expansions", MathDomain.ANALYSIS),
      option("42", "42 Harmonic analysis", MathDomain.ANALYSIS),
      option("43", "43 Abstract harmonic analysis", MathDomain.ANALYSIS),
      option("44", "44 Integral transforms", MathDomain.ANALYSIS),
      option("45", "45 Integral equations", MathDomain.ANALYSIS),
      option("46", "46 Functional analysis", MathDomain.ANALYSIS),
      option("47", "47 Operator theory", MathDomain.ANALYSIS),
      option("49", "49 Calculus of variations and optimal control", MathDomain.ANALYSIS)
    ]
  },
  {
    value: MathDomain.ALGEBRA,
    label: "Algebra",
    domain: MathDomain.ALGEBRA,
    children: [
      option("06", "06 Order, lattices, ordered algebraic structures", MathDomain.ALGEBRA),
      option("08", "08 General algebraic systems", MathDomain.ALGEBRA),
      option("12", "12 Field theory and polynomials", MathDomain.ALGEBRA),
      option("13", "13 Commutative algebra", MathDomain.ALGEBRA),
      option("14", "14 Algebraic geometry", MathDomain.ALGEBRA),
      option("15", "15 Linear and multilinear algebra; matrix theory", MathDomain.ALGEBRA),
      option("16", "16 Associative rings and algebras", MathDomain.ALGEBRA),
      option("17", "17 Nonassociative rings and algebras", MathDomain.ALGEBRA),
      option("18", "18 Category theory; homological algebra", MathDomain.ALGEBRA),
      option("19", "19 K-theory", MathDomain.ALGEBRA),
      option("20", "20 Group theory and generalizations", MathDomain.ALGEBRA),
      option("22", "22 Topological groups and Lie groups", MathDomain.ALGEBRA)
    ]
  },
  {
    value: MathDomain.ARITHMETIC,
    label: "Number theory",
    domain: MathDomain.ARITHMETIC,
    children: [
      option("11", "11 Number theory", MathDomain.ARITHMETIC)
    ]
  },
  {
    value: MathDomain.GEOMETRY,
    label: "Geometry and topology",
    domain: MathDomain.GEOMETRY,
    children: [
      option("51", "51 Geometry", MathDomain.GEOMETRY),
      option("52", "52 Convex and discrete geometry", MathDomain.GEOMETRY),
      option("53", "53 Differential geometry", MathDomain.GEOMETRY),
      option("54", "54 General topology", MathDomain.TOPOLOGY),
      option("55", "55 Algebraic topology", MathDomain.TOPOLOGY),
      option("57", "57 Manifolds and cell complexes", MathDomain.TOPOLOGY),
      option("58", "58 Global analysis, analysis on manifolds", MathDomain.GEOMETRY)
    ]
  },
  {
    value: MathDomain.COMBINATORICS,
    label: "Discrete math and computer science",
    domain: MathDomain.COMBINATORICS,
    children: [
      option("05", "05 Combinatorics", MathDomain.COMBINATORICS),
      option("68", "68 Computer science", MathDomain.COMBINATORICS),
      option("90", "90 Operations research, mathematical programming", MathDomain.COMBINATORICS),
      option("94", "94 Information and communication, circuits", MathDomain.COMBINATORICS)
    ]
  },
  {
    value: MathDomain.PROBABILITY,
    label: "Probability and statistics",
    domain: MathDomain.PROBABILITY,
    children: [
      option("60", "60 Probability theory and stochastic processes", MathDomain.PROBABILITY),
      option("62", "62 Statistics", MathDomain.PROBABILITY)
    ]
  },
  {
    value: MathDomain.LOGIC,
    label: "Foundations and logic",
    domain: MathDomain.LOGIC,
    children: [
      option("00", "00 General and miscellaneous", MathDomain.OTHER),
      option("01", "01 History and biography", MathDomain.OTHER),
      option("03", "03 Mathematical logic and foundations", MathDomain.LOGIC)
    ]
  },
  {
    value: MathDomain.OTHER,
    label: "Applied and other mathematics",
    domain: MathDomain.OTHER,
    children: [
      option("65", "65 Numerical analysis", MathDomain.OTHER),
      option("70", "70 Mechanics of particles and systems", MathDomain.OTHER),
      option("74", "74 Mechanics of deformable solids", MathDomain.OTHER),
      option("76", "76 Fluid mechanics", MathDomain.OTHER),
      option("78", "78 Optics and electromagnetic theory", MathDomain.OTHER),
      option("80", "80 Thermodynamics and heat transfer", MathDomain.OTHER),
      option("81", "81 Quantum theory", MathDomain.OTHER),
      option("82", "82 Statistical mechanics, structure of matter", MathDomain.OTHER),
      option("83", "83 Relativity and gravitational theory", MathDomain.OTHER),
      option("85", "85 Astronomy and astrophysics", MathDomain.OTHER),
      option("86", "86 Geophysics", MathDomain.OTHER),
      option("91", "91 Game theory, economics, social and behavioral sciences", MathDomain.OTHER),
      option("92", "92 Biology and other natural sciences", MathDomain.OTHER),
      option("93", "93 Systems theory; control", MathDomain.OTHER),
      option("97", "97 Mathematics education", MathDomain.OTHER)
    ]
  }
];

export const FLAT_DOMAIN_OPTIONS = MATH_DOMAINS.flatMap((domain) => [domain, ...(domain.children ?? [])]);

export function findDomainOption(value: string | MathDomain | null | undefined) {
  if (!value) return undefined;
  const normalized = String(value).trim().toUpperCase().replace(/\s+/g, "_");
  return FLAT_DOMAIN_OPTIONS.find(
    (item) => item.value.toUpperCase() === normalized || item.label.toLowerCase() === String(value).trim().toLowerCase()
  );
}

export function domainLabel(domain: MathDomain | string) {
  return findDomainOption(domain)?.label ?? "Other";
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
