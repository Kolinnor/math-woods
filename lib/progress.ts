export type ProgressEntry = {
  done: number;
  total: number;
};

type ProgressProblem = {
  translationGroupId: string;
};

export function buildProgressMap<T extends ProgressProblem>(
  problems: T[],
  solvedGroupIds: ReadonlySet<string>,
  domainForProblem: (problem: T) => string
) {
  const progress = new Map<string, ProgressEntry>();

  for (const problem of problems) {
    const domain = domainForProblem(problem);
    const entry = progress.get(domain) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (solvedGroupIds.has(problem.translationGroupId)) entry.done += 1;
    progress.set(domain, entry);
  }

  return progress;
}
