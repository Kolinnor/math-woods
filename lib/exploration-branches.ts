import {
  conditionMatches,
  type ExplorationState
} from "./exploration-engine.ts";

export type ExplorationBranchBlock = {
  branchId: number | null;
  key: string;
  kind: string;
  position: number;
  visibilityRule: unknown;
  options: Array<{ action: string; revealBranchId: number | null }>;
};

export function explorationBranchStateKey(branchId: number) {
  return `branch.${branchId}.visible`;
}

function orderedBlocks(blocks: ExplorationBranchBlock[], branchId: number | null) {
  return blocks
    .filter((block) => block.branchId === branchId)
    .sort((left, right) => left.position - right.position);
}

export function visibleExplorationBlocks<T extends ExplorationBranchBlock>(blocks: T[], state: ExplorationState) {
  const visible: T[] = [];
  const visitedBranches = new Set<number>();

  function appendBranch(branchId: number | null) {
    if (branchId !== null) {
      if (visitedBranches.has(branchId)) return;
      visitedBranches.add(branchId);
    }
    for (const block of orderedBlocks(blocks, branchId) as T[]) {
      if (!conditionMatches(block.visibilityRule, state)) continue;
      visible.push(block);
      if (block.kind !== "CHOICE") continue;
      for (const option of block.options) {
        if (
          option.action === "REVEAL"
          && option.revealBranchId !== null
          && state[explorationBranchStateKey(option.revealBranchId)] === true
        ) {
          appendBranch(option.revealBranchId);
        }
      }
    }
  }

  appendBranch(null);
  return visible;
}

export function descendantExplorationBranchIds(
  blocks: ExplorationBranchBlock[],
  rootBranchIds: number[]
) {
  const descendants = new Set<number>();
  const queue = [...rootBranchIds];
  while (queue.length) {
    const branchId = queue.shift()!;
    if (descendants.has(branchId)) continue;
    descendants.add(branchId);
    for (const block of blocks) {
      if (block.branchId !== branchId) continue;
      for (const option of block.options) {
        if (option.revealBranchId !== null && !descendants.has(option.revealBranchId)) {
          queue.push(option.revealBranchId);
        }
      }
    }
  }
  return descendants;
}

export function clearExplorationBranches(
  state: ExplorationState,
  blocks: ExplorationBranchBlock[],
  rootBranchIds: number[],
  pageKey: string
) {
  const branchIds = descendantExplorationBranchIds(blocks, rootBranchIds);
  const nextState = { ...state };
  const clearedBlockKeys: string[] = [];

  for (const branchId of branchIds) delete nextState[explorationBranchStateKey(branchId)];
  for (const block of blocks) {
    if (block.branchId === null || !branchIds.has(block.branchId)) continue;
    const stableBlockKey = `${pageKey}:${block.key}`;
    clearedBlockKeys.push(stableBlockKey);
    delete nextState[`block.${stableBlockKey}.answered`];
    delete nextState[`block.${stableBlockKey}.correct`];
  }

  return { branchIds: [...branchIds], clearedBlockKeys, state: nextState };
}
