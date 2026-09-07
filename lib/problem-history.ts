// Missing historical data is distinct from an explicitly unset difficulty (null).
export function recordedProblemDifficulty(snapshot: unknown): number | null | undefined {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return undefined;
  const value = snapshot as Record<string, unknown>;
  if (value.schemaVersion !== 1) return undefined;
  if (value.difficulty === null) return null;
  return typeof value.difficulty === "number" && Number.isInteger(value.difficulty) && value.difficulty >= 1 && value.difficulty <= 100
    ? value.difficulty : undefined;
}
