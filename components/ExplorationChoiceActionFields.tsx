"use client";

export function ExplorationChoiceActionFields({
  blocks,
  currentBlockId,
  toBlockId
}: {
  blocks: Array<{ id: number; label: string }>;
  currentBlockId: number;
  toBlockId: number | null;
}) {
  return (
    <label>
      <span>Next block</span>
      <input name="action" type="hidden" value="PAGE" />
      <select name="toBlockId" defaultValue={toBlockId ?? ""}>
        <option value="">Use Continue</option>
        {blocks.filter((block) => block.id !== currentBlockId).map((block) => (
          <option key={block.id} value={block.id}>{block.label}</option>
        ))}
      </select>
    </label>
  );
}
