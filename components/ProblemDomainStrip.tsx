"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ProblemDomainFamily, ProblemDomainOption } from "@/lib/domains";

type SortKey = "family" | "name" | "diff" | "date";

type ProblemDomainStripProps = {
  domains: ProblemDomainOption[];
  families: Record<ProblemDomainFamily, { label: string; color: string; order: number }>;
  selectedDomain?: string;
};

const SORT_LABELS: Record<SortKey, string> = {
  family: "famille",
  name: "A-Z",
  diff: "difficulté",
  date: "date"
};

function normalized(value: string | undefined) {
  return (value ?? "").toUpperCase();
}

export function ProblemDomainStrip({ domains, families, selectedDomain }: ProblemDomainStripProps) {
  const [sort, setSort] = useState<SortKey>("family");
  const [open, setOpen] = useState(false);
  const activeDomain = normalized(selectedDomain);
  const sortedDomains = useMemo(() => {
    return [...domains].sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label, "fr");
      if (sort === "diff") return a.diff - b.diff || a.label.localeCompare(b.label, "fr");
      if (sort === "date") return a.year - b.year || a.label.localeCompare(b.label, "fr");
      return families[a.family].order - families[b.family].order || a.label.localeCompare(b.label, "fr");
    });
  }, [domains, families, sort]);

  function choose(nextSort: SortKey) {
    setSort(nextSort);
    setOpen(false);
  }

  return (
    <section className="problem-domain-strip" aria-labelledby="problem-domain-strip-title">
      <div className="problem-domain-strip-header">
        <h2 id="problem-domain-strip-title">Browse by domain</h2>
        <div className="problem-domain-strip-actions">
          <Link href="/problems">all 21 domains</Link>
          <div className="problem-domain-sort">
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
              by {SORT_LABELS[sort]} <span aria-hidden="true">▾</span>
            </button>
            {open && (
              <div className="problem-domain-sort-menu">
                <button type="button" onClick={() => choose("family")}>
                  Famille
                </button>
                <button type="button" onClick={() => choose("name")}>
                  Alphabétique
                </button>
                <button type="button" onClick={() => choose("diff")}>
                  Difficulté
                </button>
                <button type="button" onClick={() => choose("date")}>
                  Date historique
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="problem-domain-tile-grid">
        {sortedDomains.map((domain) => {
          const activeValues = [domain.value, ...(domain.aliases ?? [])].map(normalized);
          const active = activeValues.includes(activeDomain);
          return (
            <Link
              key={domain.value}
              href={`/problems?domain=${domain.value}` as never}
              className={active ? "problem-domain-tile active" : "problem-domain-tile"}
            >
              <span className="problem-domain-glyph" style={{ backgroundColor: families[domain.family].color }}>
                {domain.glyph}
              </span>
              <span>{domain.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
