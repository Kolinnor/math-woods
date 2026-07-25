"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import type { ProblemDomainFamily, ProblemDomainOption } from "@/lib/domains";

type SortKey = "family" | "name" | "diff" | "date";

type ProblemDomainStripProps = {
  domains: ProblemDomainOption[];
  families: Record<ProblemDomainFamily, { label: string; color: string; order: number }>;
  selectedDomain?: string;
};

const SORT_LABELS: Record<SortKey, string> = {
  family: "theme",
  name: "A-Z",
  diff: "difficulty",
  date: "date"
};

function normalized(value: string | undefined) {
  return (value ?? "").toUpperCase();
}

function matchesDomain(value: string, aliases: string[] | undefined, activeDomain: string) {
  return [value, ...(aliases ?? [])].map(normalized).includes(activeDomain);
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
        <div className="problem-domain-strip-title-row">
          <h2 id="problem-domain-strip-title">Browse by domain</h2>
          <Link href="/problems" scroll={false}>
            all domains
          </Link>
        </div>
        <div className="problem-domain-strip-actions">
          <div className="problem-domain-sort">
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
              by {SORT_LABELS[sort]} <span aria-hidden="true">▾</span>
            </button>
            {open && (
              <div className="problem-domain-sort-menu">
                <button type="button" onClick={() => choose("family")}>
                  Theme
                </button>
                <button type="button" onClick={() => choose("name")}>
                  Alphabetical
                </button>
                <button type="button" onClick={() => choose("diff")}>
                  Difficulty
                </button>
                <button type="button" onClick={() => choose("date")}>
                  Historical date
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="problem-domain-tile-grid">
        {sortedDomains.map((domain) => {
          const subdomains = [...(domain.children ?? [])].sort((left, right) => left.label.localeCompare(right.label, "en"));
          const activeSubdomain = subdomains.find((subdomain) =>
            matchesDomain(subdomain.value, subdomain.aliases, activeDomain)
          );
          const active = matchesDomain(domain.value, domain.aliases, activeDomain) || Boolean(activeSubdomain);

          return (
            <div key={domain.value} className="problem-domain-tile-shell">
              <Link
                href={`/problems?domain=${domain.value}` as never}
                className={active ? "problem-domain-tile active" : "problem-domain-tile"}
                scroll={false}
              >
                <span className="problem-domain-glyph" style={{ backgroundColor: families[domain.family].color }}>
                  {domain.glyph}
                </span>
                <span>{domain.label}</span>
              </Link>
              {subdomains.length > 0 && (
                <AutoClosingDetails className="problem-domain-subdomains">
                  <summary
                    aria-label={`Show ${domain.label} subdomains`}
                    title={`Show ${domain.label} subdomains`}
                  >
                    <ChevronDown size={12} aria-hidden="true" />
                  </summary>
                  <div className="problem-domain-subdomain-menu">
                    {subdomains.map((subdomain) => (
                      <Link
                        key={subdomain.value}
                        href={`/problems?domain=${subdomain.value}` as never}
                        className={activeSubdomain?.value === subdomain.value ? "active" : undefined}
                        scroll={false}
                      >
                        {subdomain.label}
                      </Link>
                    ))}
                  </div>
                </AutoClosingDetails>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
