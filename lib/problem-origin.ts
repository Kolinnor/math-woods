export const UNKNOWN_PROBLEM_ORIGIN = "Unknown";

const UNKNOWN_ORIGIN_VALUES = new Set(["unknown", "inconnu", "inconnue"]);

export function isUnknownProblemOrigin(value: unknown) {
  const origin = String(value ?? "").trim().toLocaleLowerCase();
  return !origin || UNKNOWN_ORIGIN_VALUES.has(origin);
}

export function normalizeProblemOrigin(value: unknown) {
  const origin = String(value ?? "").trim();
  return !origin || isUnknownProblemOrigin(origin) ? UNKNOWN_PROBLEM_ORIGIN : origin;
}

export function localizedProblemOrigin(value: unknown, unknownLabel: string) {
  return isUnknownProblemOrigin(value) ? unknownLabel : String(value ?? "").trim();
}
