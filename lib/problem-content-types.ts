export const PROBLEM_CONTENT_TYPES = ["problem", "exercise"] as const;

export type ProblemContentType = (typeof PROBLEM_CONTENT_TYPES)[number];

export function parseProblemContentTypes(value: string | string[] | undefined): ProblemContentType[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const selected = PROBLEM_CONTENT_TYPES.filter((type) => values.includes(type));

  return selected.length > 0 ? selected : ["problem"];
}

export function problemContentTypeWhere(types: readonly ProblemContentType[]) {
  if (types.length !== 1) return null;
  return { isExercise: types[0] === "exercise" };
}

export function isDefaultProblemContentType(types: readonly ProblemContentType[]) {
  return types.length === 1 && types[0] === "problem";
}
