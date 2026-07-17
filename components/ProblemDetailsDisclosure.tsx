"use client";

import { useState, type ReactNode } from "react";

export function ProblemDetailsDisclosure({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="secondary problem-compose-details-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Add details
      </button>
      {open && (
        <div className="problem-compose-details-body problem-compose-card">
          {children}
        </div>
      )}
    </>
  );
}
