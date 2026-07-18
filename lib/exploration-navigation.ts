export function hasReachableExplorationExit({
  choiceTargetPageIds,
  continueToPageId,
  readablePageIds
}: {
  choiceTargetPageIds: Array<number | null>;
  continueToPageId: number | null;
  readablePageIds: ReadonlySet<number>;
}) {
  if (continueToPageId !== null && readablePageIds.has(continueToPageId)) return true;
  return choiceTargetPageIds.some((targetPageId) => targetPageId !== null && readablePageIds.has(targetPageId));
}
