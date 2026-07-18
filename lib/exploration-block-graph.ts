export type ExplorationGraphBlock = {
  id: number;
  isStart: boolean;
  continueToBlockId: number | null;
  optionTargetBlockIds: Array<number | null>;
  outcomeTargetBlockIds: Array<number | null>;
};

export function nextExplorationBlockId(
  outcomeTargetBlockId: number | null | undefined,
  optionTargetBlockId: number | null | undefined,
  continueToBlockId: number | null
) {
  return outcomeTargetBlockId ?? optionTargetBlockId ?? continueToBlockId;
}

export function explorationPathAfter(path: number[], sourceIndex: number, targetBlockId: number) {
  const safeIndex = Math.max(0, Math.min(Math.trunc(sourceIndex), path.length - 1));
  return [...path.slice(0, safeIndex + 1), targetBlockId].slice(-2000);
}

export function canAutomaticallyAdvance(path: number[], targetBlockId: number) {
  return !path.includes(targetBlockId);
}

export function reachableExplorationBlockIds(blocks: ExplorationGraphBlock[]) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const start = blocks.find((block) => block.isStart) ?? blocks[0];
  const visited = new Set<number>();
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const blockId = queue.shift()!;
    if (visited.has(blockId)) continue;
    visited.add(blockId);
    const block = byId.get(blockId);
    if (!block) continue;
    const targets = [block.continueToBlockId, ...block.optionTargetBlockIds, ...block.outcomeTargetBlockIds];
    for (const target of targets) {
      if (target !== null && byId.has(target) && !visited.has(target)) queue.push(target);
    }
  }
  return visited;
}
