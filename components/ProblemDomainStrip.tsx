"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { ProgressTicks } from "@/components/ProgressTicks";
import type { ProblemDomainFamily, ProblemDomainOption } from "@/lib/domains";
import type { Dictionary, InterfaceLocale } from "@/lib/i18n/types";

type SortKey = "family" | "name" | "diff" | "date";

type ProblemDomainStripProps = {
  domains: ProblemDomainOption[];
  families: Record<ProblemDomainFamily, { label: string; color: string; order: number }>;
  labels: Dictionary["problems"]["domainBrowser"];
  locale: InterfaceLocale;
  progress?: Record<string, { done: number; total: number }>;
  selectedDomain?: string;
};

function normalized(value: string | undefined) {
  return (value ?? "").toUpperCase();
}

function matchesDomain(value: string, aliases: string[] | undefined, activeDomain: string) {
  return [value, ...(aliases ?? [])].map(normalized).includes(activeDomain);
}

function template(value: string, key: string, replacement: string) {
  return value.replace(`{${key}}`, replacement);
}

export function ProblemDomainStrip({ domains, families, labels, locale, progress, selectedDomain }: ProblemDomainStripProps) {
  const [sort, setSort] = useState<SortKey>("family");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const activeDomain = normalized(selectedDomain);
  const sortedDomains = useMemo(() => {
    return [...domains].sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label, locale);
      if (sort === "diff") return a.diff - b.diff || a.label.localeCompare(b.label, locale);
      if (sort === "date") return a.year - b.year || a.label.localeCompare(b.label, locale);
      return families[a.family].order - families[b.family].order || a.label.localeCompare(b.label, locale);
    });
  }, [domains, families, locale, sort]);
  const activeSortLabel =
    sort === "family"
      ? labels.sortLabels.family
      : sort === "name"
        ? labels.sortLabels.name
        : sort === "diff"
          ? labels.sortLabels.difficulty
          : labels.sortLabels.date;
  const visibleDomains = useMemo(() => {
    if (expanded || sortedDomains.length <= 8) return sortedDomains;

    const firstDomains = sortedDomains.slice(0, 8);
    const activeTopLevelDomain = sortedDomains.find((domain) =>
      matchesDomain(domain.value, domain.aliases, activeDomain)
      || domain.children?.some((child) => matchesDomain(child.value, child.aliases, activeDomain))
    );
    if (!activeTopLevelDomain || firstDomains.some((domain) => domain.value === activeTopLevelDomain.value)) {
      return firstDomains;
    }

    return [...firstDomains.slice(0, 7), activeTopLevelDomain];
  }, [activeDomain, expanded, sortedDomains]);

  function choose(nextSort: SortKey) {
    setSort(nextSort);
    setOpen(false);
  }

  return (
    <section className="problem-domain-strip" aria-labelledby="problem-domain-strip-title">
      <div className="problem-domain-strip-header">
        <div className="problem-domain-strip-title-row">
          <h2 id="problem-domain-strip-title">{labels.title}</h2>
          <Link href="/problems" scroll={false}>
            {labels.allDomains}
          </Link>
          {domains.length > 8 && (
            <button
              type="button"
              className="problem-domain-visibility-toggle"
              aria-expanded={expanded}
              aria-label={expanded ? labels.collapseDomains : labels.showAllDomains}
              title={expanded ? labels.collapseDomains : labels.showAllDomains}
              onClick={() => setExpanded((value) => !value)}
            >
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="problem-domain-strip-actions">
          <div className="problem-domain-sort">
            <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
              {template(labels.sortBy, "label", activeSortLabel)} <span aria-hidden="true">▾</span>
            </button>
            {open && (
              <div className="problem-domain-sort-menu">
                <button type="button" onClick={() => choose("family")}>
                  {labels.sortOptions.family}
                </button>
                <button type="button" onClick={() => choose("name")}>
                  {labels.sortOptions.name}
                </button>
                <button type="button" onClick={() => choose("diff")}>
                  {labels.sortOptions.difficulty}
                </button>
                <button type="button" onClick={() => choose("date")}>
                  {labels.sortOptions.date}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="problem-domain-tile-grid">
        {visibleDomains.map((domain) => {
          const subdomains = [...(domain.children ?? [])].sort((left, right) => left.label.localeCompare(right.label, locale));
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
                {progress?.[domain.value] && (
                  <>
                    <ProgressTicks
                      done={progress[domain.value].done}
                      total={progress[domain.value].total}
                    />
                    <span className="problem-domain-tile-count">
                      {template(
                        template(labels.solvedCount, "done", String(progress[domain.value].done)),
                        "total",
                        String(progress[domain.value].total)
                      )}
                    </span>
                  </>
                )}
              </Link>
              {subdomains.length > 0 && (
                <AutoClosingDetails className="problem-domain-subdomains">
                  <summary
                    aria-label={template(labels.showSubdomains, "domain", domain.label)}
                    title={template(labels.showSubdomains, "domain", domain.label)}
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
