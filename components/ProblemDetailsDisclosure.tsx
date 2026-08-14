"use client";

import { useState, type ReactNode } from "react";

export function ProblemDetailsDisclosure({ children, label = "Add details" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="secondary problem-compose-details-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
      </button>
      <div className="problem-compose-details-body problem-compose-card" hidden={!open}>
        {children}
      </div>
    </>
  );
}
