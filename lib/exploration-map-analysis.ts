export type ExplorationMapGraphPage = {
  id: number;
  isStart: boolean;
  targetPageIds: Array<number | null>;
};

export function reachableExplorationPageIds(pages: ExplorationMapGraphPage[]) {
  const existingIds = new Set(pages.map((page) => page.id));
  const startPage = pages.find((page) => page.isStart) ?? pages[0];
  if (!startPage) return new Set<number>();
  const targets = new Map(pages.map((page) => [
    page.id,
    page.targetPageIds.filter((target): target is number => target !== null && existingIds.has(target))
  ]));
  const reachable = new Set<number>();
  const queue = [startPage.id];
  while (queue.length) {
    const pageId = queue.shift()!;
    if (reachable.has(pageId)) continue;
    reachable.add(pageId);
    for (const targetPageId of targets.get(pageId) ?? []) {
      if (!reachable.has(targetPageId)) queue.push(targetPageId);
    }
  }
  return reachable;
}
