export type FolderedExplorationBlock = {
  id: number;
  folderId: number | null;
};

export function explorationBlocksInFolder<T extends FolderedExplorationBlock>(
  blocks: T[],
  folderIds: number[],
  folderId: number | null
) {
  if (folderId !== null) return blocks.filter((block) => block.folderId === folderId);
  const knownFolderIds = new Set(folderIds);
  return blocks.filter((block) => block.folderId === null || !knownFolderIds.has(block.folderId));
}

export function orderExplorationBlocksByFolders<T extends FolderedExplorationBlock>(
  blocks: T[],
  folderIds: number[]
) {
  return [
    ...explorationBlocksInFolder(blocks, folderIds, null),
    ...folderIds.flatMap((folderId) => explorationBlocksInFolder(blocks, folderIds, folderId))
  ];
}

export function moveExplorationBlockToFolder<T extends FolderedExplorationBlock>(
  blocks: T[],
  folderIds: number[],
  blockId: number,
  targetFolderId: number | null,
  targetIndex: number
) {
  const moving = blocks.find((block) => block.id === blockId);
  if (!moving) return blocks;
  const remaining = blocks.filter((block) => block.id !== blockId);
  const targetGroup = explorationBlocksInFolder(remaining, folderIds, targetFolderId);
  const nextIndex = Math.max(0, Math.min(targetGroup.length, Math.trunc(targetIndex)));
  targetGroup.splice(nextIndex, 0, { ...moving, folderId: targetFolderId });
  const targetIds = new Set(targetGroup.map((block) => block.id));
  return orderExplorationBlocksByFolders([
    ...remaining.filter((block) => !targetIds.has(block.id)),
    ...targetGroup
  ], folderIds);
}
