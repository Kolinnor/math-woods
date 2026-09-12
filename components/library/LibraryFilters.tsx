"use client";

import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

/** One set of controls: CSS exposes them on desktop; mobile has an accessible toggle. */
export function LibraryFilters({ locale, children, activeCount = 0 }: {
  locale: "fr" | "en";
  children: ReactNode;
  activeCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={`library-filters${open ? " is-open" : ""}`}>
    <button className="library-filter-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <SlidersHorizontal size={16} aria-hidden="true" />{locale === "fr" ? "Filtres" : "Filters"}{activeCount > 0 && <span className="library-filter-count">{activeCount}</span>}
    </button>
    <div id={id} className="library-filters-content">{children}</div>
    <noscript><style>{".library-root .library-filter-toggle{display:none}.library-root .library-filters .library-filters-content{display:grid}"}</style></noscript>
  </div>;
}
