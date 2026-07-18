"use client";

import { useState } from "react";

export function ExplorationNextBlockFields({
  blocks,
  initialBlockId,
  initialAutomatic
}: {
  blocks: Array<{ id: number; label: string }>;
  initialBlockId: number | null;
  initialAutomatic: boolean;
}) {
  const [target, setTarget] = useState(initialBlockId === null ? "" : String(initialBlockId));
  const [automatic, setAutomatic] = useState(initialBlockId !== null && initialAutomatic);

  return (
    <>
      <label>
        <span>Next block</span>
        <select
          name="continueToBlockId"
          value={target}
          onChange={(event) => {
            const value = event.target.value;
            setTarget(value);
            if (!value) setAutomatic(false);
          }}
        >
          <option value="">End here</option>
          {blocks.map((block) => <option key={block.id} value={block.id}>{block.label}</option>)}
        </select>
      </label>
      <label className="checkbox-field studio-block-route-automatic" title="Reveal the next block without waiting for the reader to click Continue.">
        <input
          checked={automatic}
          disabled={!target}
          name="autoContinue"
          onChange={(event) => setAutomatic(event.target.checked)}
          type="checkbox"
        />
        <span><strong>Automatic</strong></span>
      </label>
    </>
  );
}
