"use client";

import { PencilLine } from "lucide-react";

export function MobileSolutionBar({ label }: { label: string }) {
  function openEditor() {
    const disclosure = document.getElementById("write-solution");
    if (!(disclosure instanceof HTMLDetailsElement)) return;
    disclosure.open = true;
    disclosure.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      disclosure.querySelector<HTMLElement>(".cm-content")?.focus();
    }, 450);
  }

  return (
    <div className="mobile-problem-solution-bar">
      <button type="button" onClick={openEditor}>
        <PencilLine size={19} aria-hidden="true" />
        <span>{label}</span>
      </button>
    </div>
  );
}
