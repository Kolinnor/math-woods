"use client";

import { useState, type ReactNode } from "react";

export function RevealSolvedDailyProblem({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  const [revealed, setRevealed] = useState(false);

  if (revealed) return children;

  return (
    <button
      type="button"
      className="home-daily-solved-toggle"
      onClick={() => setRevealed(true)}
    >
      {label}
    </button>
  );
}
