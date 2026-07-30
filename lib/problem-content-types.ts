import { UserMathLevel } from "@prisma/client";

export const PROBLEM_CONTENT_TYPES = ["problem", "exercise"] as const;

export type ProblemContentType = (typeof PROBLEM_CONTENT_TYPES)[number];

const PRE_UNIVERSITY_MATH_LEVELS = new Set<UserMathLevel>([
  UserMathLevel.BEGINNER_PRE_UNIVERSITY,
  UserMathLevel.EARLY_UNDERGRAD
]);

export function defaultProblemContentTypesForMathLevel(
  mathLevel: UserMathLevel | null | undefined
): ProblemContentType[] {
  return mathLevel && PRE_UNIVERSITY_MATH_LEVELS.has(mathLevel)
    ? ["problem", "exercise"]
    : ["problem"];
}

export function parseProblemContentTypes(
  value: string | string[] | undefined,
  defaultTypes: readonly ProblemContentType[] = ["problem"]
): ProblemContentType[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const selected = PROBLEM_CONTENT_TYPES.filter((type) => values.includes(type));

  return selected.length > 0 ? selected : [...defaultTypes];
}

export function problemContentTypeWhere(types: readonly ProblemContentType[]) {
  if (types.length !== 1) return null;
  return { isExercise: types[0] === "exercise" };
}

export function isDefaultProblemContentType(
  types: readonly ProblemContentType[],
  defaultTypes: readonly ProblemContentType[] = ["problem"]
) {
  return types.length === defaultTypes.length && types.every((type, index) => type === defaultTypes[index]);
}
