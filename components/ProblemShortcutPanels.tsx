"use client";

import { Sparkles, Target } from "lucide-react";
import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { InProgressProblemReader } from "@/components/InProgressProblemReader";

type PanelId = "recommended" | "inProgress";

/**
 * Two symmetric tabs above the problem browser: recommendations on the left,
 * problems in progress on the right. One panel is always shown, recommendations
 * first; the tabs only switch between them and never fold the area away.
 */
export function ProblemShortcutPanels({
  recommended,
  inProgress,
  labels
}: {
  recommended: ReactNode | null;
  inProgress: Omit<ComponentProps<typeof InProgressProblemReader>, "onTotalChange">;
  labels: { recommended: string; inProgress: string };
}) {
  const [active, setActive] = useState<PanelId>(recommended ? "recommended" : "inProgress");
  const [inProgressCount, setInProgressCount] = useState(inProgress.initialPage.total);
  const tabs: PanelId[] = recommended ? ["recommended", "inProgress"] : ["inProgress"];

  function moveWithArrows(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(active) + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setActive(next);
    document.getElementById(`problems-shortcut-tab-${next}`)?.focus();
  }

  return (
    <section className="problems-shortcuts">
      <div className="problems-shortcut-buttons" role="tablist">
        {recommended && (
          <button
            type="button"
            role="tab"
            id="problems-shortcut-tab-recommended"
            className="problems-shortcut-button is-recommended"
            aria-selected={active === "recommended"}
            aria-controls="problems-shortcut-recommended"
            tabIndex={active === "recommended" ? 0 : -1}
            onClick={() => setActive("recommended")}
            onKeyDown={moveWithArrows}
          >
            <span className="problems-shortcut-icon" aria-hidden="true"><Sparkles size={17} strokeWidth={2.4} /></span>
            <span className="problems-shortcut-label">{labels.recommended}</span>
          </button>
        )}
        <button
          type="button"
          role="tab"
          id="problems-shortcut-tab-inProgress"
          className="problems-shortcut-button is-in-progress"
          aria-selected={active === "inProgress"}
          aria-controls="problems-shortcut-in-progress"
          tabIndex={active === "inProgress" ? 0 : -1}
          onClick={() => setActive("inProgress")}
          onKeyDown={moveWithArrows}
        >
          <span className="problems-shortcut-icon" aria-hidden="true"><Target size={17} strokeWidth={2.5} /></span>
          <span className="problems-shortcut-label">{labels.inProgress}</span>
          {inProgressCount > 0 && <span className="problems-shortcut-count">{inProgressCount}</span>}
        </button>
      </div>
      {recommended && (
        <div
          id="problems-shortcut-recommended"
          className="problems-shortcut-panel"
          role="tabpanel"
          aria-labelledby="problems-shortcut-tab-recommended"
          hidden={active !== "recommended"}
        >
          {recommended}
        </div>
      )}
      <div
        id="problems-shortcut-in-progress"
        className="problems-shortcut-panel"
        role="tabpanel"
        aria-labelledby="problems-shortcut-tab-inProgress"
        hidden={active !== "inProgress"}
      >
        <InProgressProblemReader {...inProgress} onTotalChange={setInProgressCount} />
      </div>
    </section>
  );
}
