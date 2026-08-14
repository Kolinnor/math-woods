"use client";

import { useState, type ReactNode } from "react";

export function HomeEditorialSwitcher({
  problem,
  contest,
  problemLabel,
  contestLabel
}: {
  problem: ReactNode;
  contest: ReactNode;
  problemLabel: string;
  contestLabel: string;
}) {
  const [active, setActive] = useState<"problem" | "contest">("problem");
  if (!contest) return problem;
  if (!problem) return contest;

  return (
    <section className="home-editorial-switcher">
      <div className="home-editorial-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={active === "problem"} onClick={() => setActive("problem")}>{problemLabel}</button>
        <button type="button" role="tab" aria-selected={active === "contest"} onClick={() => setActive("contest")}>{contestLabel}</button>
      </div>
      <div role="tabpanel">{active === "problem" ? problem : contest}</div>
    </section>
  );
}
