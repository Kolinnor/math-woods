"use client";

import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";

export function HomeEditorialSwitcher({
  problem,
  contest,
  problemLabel,
  contestLabel,
  preferenceKey,
  prioritizeContest,
  hideContestLabel,
  showContestLabel,
  sectionLabel
}: {
  problem: ReactNode;
  contest: ReactNode;
  problemLabel: string;
  contestLabel: string;
  preferenceKey: string;
  prioritizeContest: boolean;
  hideContestLabel: string;
  showContestLabel: string;
  sectionLabel: string;
}) {
  const id = useId();
  const [selected, setSelected] = useState<"problem" | "contest" | null>(null);
  const [hidden, setHidden] = useState(false);
  const storageKey = `math-woods:home-contest:${preferenceKey}`;

  useEffect(() => {
    try { setHidden(localStorage.getItem(storageKey) === "hidden"); } catch { /* Preferences are optional. */ }
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === "problem" || saved === "contest") setSelected(saved);
    } catch { /* Keep the default when storage is unavailable. */ }
    const syncHidden = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        try { setHidden(localStorage.getItem(storageKey) === "hidden"); } catch { /* Keep the current choice. */ }
      }
    };
    window.addEventListener("storage", syncHidden);
    return () => window.removeEventListener("storage", syncHidden);
  }, [storageKey]);

  function select(tab: "problem" | "contest") {
    setSelected(tab);
    try { sessionStorage.setItem(storageKey, tab); } catch { /* In-memory selection still works. */ }
  }
  function toggleHidden() {
    const nextHidden = !hidden;
    setHidden(nextHidden);
    select(nextHidden ? "problem" : "contest");
    try {
      if (nextHidden) localStorage.setItem(storageKey, "hidden");
      else localStorage.removeItem(storageKey);
    } catch { /* In-memory dismissal still works. */ }
  }

  if (!contest) return problem;
  const active = hidden ? "problem" : !problem ? "contest" : selected ?? (prioritizeContest ? "contest" : "problem");
  const tabs = prioritizeContest ? ["contest", "problem"] as const : ["problem", "contest"] as const;
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? 1 : event.key === "ArrowRight" ? (index + 1) % 2 : event.key === "ArrowLeft" ? (index + 1) % 2 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    select(tabs[nextIndex]);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <section className="home-editorial-switcher" aria-label={sectionLabel}>
      <div className="home-editorial-toolbar">
        {!hidden && problem && <div className="home-editorial-tabs" role="tablist" aria-label={sectionLabel}>
          {tabs.map((tab, index) => <button key={tab} id={`${id}-${tab}-tab`} type="button" role="tab" aria-selected={active === tab} aria-controls={`${id}-${tab}-panel`} tabIndex={active === tab ? 0 : -1} onClick={() => select(tab)} onKeyDown={event => navigateTabs(event, index)}>{tab === "problem" ? problemLabel : contestLabel}</button>)}
        </div>}
        <button key="visibility" type="button" className="home-editorial-visibility" onClick={toggleHidden}>{hidden ? showContestLabel : hideContestLabel}</button>
      </div>
      <div id={`${id}-problem-panel`} hidden={active !== "problem"} role={!hidden && problem ? "tabpanel" : undefined} aria-labelledby={!hidden && problem ? `${id}-problem-tab` : undefined}>{problem}</div>
      <div id={`${id}-contest-panel`} hidden={active !== "contest"} role={!hidden && problem ? "tabpanel" : undefined} aria-labelledby={!hidden && problem ? `${id}-contest-tab` : undefined}>{contest}</div>
    </section>
  );
}
