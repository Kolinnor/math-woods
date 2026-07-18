"use client";

import { useId, useState } from "react";
import { ExplorationHelpTooltip } from "@/components/ExplorationHelpTooltip";

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
  const automaticId = useId();

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
      <div className="checkbox-field studio-block-route-automatic">
        <input
          id={automaticId}
          checked={automatic}
          disabled={!target}
          name="autoContinue"
          onChange={(event) => setAutomatic(event.target.checked)}
          type="checkbox"
        />
        <label className="studio-block-route-automatic-label" htmlFor={automaticId}><strong>Automatic</strong></label>
        <ExplorationHelpTooltip label="About automatic progression">
          Shows the next block immediately. When disabled, the reader clicks Continue first.
        </ExplorationHelpTooltip>
      </div>
    </>
  );
}
