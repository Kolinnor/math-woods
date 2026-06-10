import { MathDomain } from "@prisma/client";

export const MATH_DOMAINS: Array<{ value: MathDomain; label: string }> = [
  { value: MathDomain.ANALYSIS, label: "Analysis" },
  { value: MathDomain.ALGEBRA, label: "Algebra" },
  { value: MathDomain.ARITHMETIC, label: "Arithmetic" },
  { value: MathDomain.GEOMETRY, label: "Geometry" },
  { value: MathDomain.COMBINATORICS, label: "Combinatorics" },
  { value: MathDomain.PROBABILITY, label: "Probability" },
  { value: MathDomain.TOPOLOGY, label: "Topology" },
  { value: MathDomain.LOGIC, label: "Logic" },
  { value: MathDomain.OTHER, label: "Other" }
];

export function domainLabel(domain: MathDomain) {
  return MATH_DOMAINS.find((item) => item.value === domain)?.label ?? "Other";
}

export function parseMathDomain(value: FormDataEntryValue | null): MathDomain {
  const input = String(value ?? "").toUpperCase() as MathDomain;
  return Object.values(MathDomain).includes(input) ? input : MathDomain.OTHER;
}
