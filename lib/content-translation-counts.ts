type TranslatedContentRow = {
  translationGroupId: string;
  problem: { translationGroupId: string };
};

export function distinctContentCountsByProblemGroup(rows: TranslatedContentRow[]) {
  const translationGroupsByProblemGroup = new Map<string, Set<string>>();
  for (const row of rows) {
    const problemGroupId = row.problem.translationGroupId;
    const contentGroups = translationGroupsByProblemGroup.get(problemGroupId) ?? new Set<string>();
    contentGroups.add(row.translationGroupId);
    translationGroupsByProblemGroup.set(problemGroupId, contentGroups);
  }
  return new Map([...translationGroupsByProblemGroup].map(([groupId, contentGroups]) => [groupId, contentGroups.size]));
}
