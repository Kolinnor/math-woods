export const EXPLORATION_CHANGE_COALESCE_MS = 5 * 60 * 1000;

export function shouldCoalesceExplorationChange(
  latest: {
    changeSummary: string | null;
    publishedAt: Date;
    publishedById: number | null;
    sessionCount: number;
  } | null,
  userId: number,
  summary: string,
  now = Date.now()
) {
  return Boolean(
    latest &&
    latest.publishedById === userId &&
    latest.changeSummary === summary &&
    latest.publishedAt.getTime() >= now - EXPLORATION_CHANGE_COALESCE_MS &&
    latest.sessionCount === 0
  );
}
