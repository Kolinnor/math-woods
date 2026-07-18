"use client";

import { useState } from "react";

type ExplorationChoiceAction = "STAY" | "PAGE" | "REVEAL";

export function ExplorationChoiceActionFields({
  action: initialAction,
  currentPageId,
  pages,
  toPageId
}: {
  action: ExplorationChoiceAction;
  currentPageId: number;
  pages: Array<{ id: number; position: number; title: string }>;
  toPageId: number | null;
}) {
  const [action, setAction] = useState<ExplorationChoiceAction>(initialAction);

  return (
    <>
      <label>
        <span>Action</span>
        <select name="action" onChange={(event) => setAction(event.target.value as ExplorationChoiceAction)} value={action}>
          <option value="STAY">Stay on page</option>
          <option value="PAGE">Go to page</option>
          <option value="REVEAL">Reveal blocks</option>
        </select>
      </label>
      {action === "PAGE" && (
        <label>
          <span>Destination</span>
          <select name="toPageId" defaultValue={toPageId ?? ""}>
            <option value="">Choose a page</option>
            {pages.filter((page) => page.id !== currentPageId).map((page) => (
              <option key={page.id} value={page.id}>{page.position}. {page.title}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
