"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

type MobileFilterSheetProps = {
  activeCount: number;
  children: ReactNode;
  closeLabel: string;
  filterLabel: string;
  resultLabel: string;
};

export function MobileFilterSheet({
  activeCount,
  children,
  closeLabel,
  filterLabel,
  resultLabel
}: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.mobileFilterOpen = "true";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      delete document.documentElement.dataset.mobileFilterOpen;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <div className="problem-mobile-filter-toolbar">
        <button
          type="button"
          className="problem-mobile-filter-trigger"
          aria-controls={panelId}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          <span>{filterLabel}</span>
          {activeCount > 0 && <strong>{activeCount}</strong>}
        </button>
      </div>
      <div className={`problem-filter-layer${open ? " is-open" : ""}`}>
        <button
          type="button"
          className="problem-filter-backdrop"
          aria-label={closeLabel}
          onClick={() => setOpen(false)}
          tabIndex={open ? 0 : -1}
        />
        <aside className="problems-filter-panel" id={panelId} aria-label={filterLabel}>
          <header className="problem-mobile-filter-header">
            <strong>{filterLabel}</strong>
            <button type="button" onClick={() => setOpen(false)} aria-label={closeLabel}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {children}
          <footer className="problem-mobile-filter-footer">
            <button type="button" onClick={() => setOpen(false)}>{resultLabel}</button>
          </footer>
        </aside>
      </div>
    </>
  );
}
