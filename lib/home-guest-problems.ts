export const HOME_GUEST_PROBLEM_GROUP_IDS = [
  "cmsivlyco002bqk01w80m0111", // Polynomial of prime numbers
  "cmsk3535w002pqk01x6f9lk7r", // La piece manquante
  "cmsejcus20005pg014xgr58da", // 1 minute left for this integral
  "cmsa48fhp0003mo01eevwb6r0" // Le probleme du parc
] as const;

export function sortHomeGuestProblemsByDifficulty<T extends { difficulty: number | null; id: number }>(
  problems: readonly T[]
) {
  return [...problems].sort(
    (left, right) =>
      (left.difficulty ?? Number.POSITIVE_INFINITY)
      - (right.difficulty ?? Number.POSITIVE_INFINITY)
      || left.id - right.id
  );
}
