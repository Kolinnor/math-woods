"use client";

import Link from "next/link";
import { useState } from "react";
import type { DomainOption } from "@/lib/domains";

type DomainBrowserNavProps = {
  domains: DomainOption[];
  selectedDomain?: string;
};

export function DomainBrowserNav({ domains, selectedDomain }: DomainBrowserNavProps) {
  const selectedGroup = domains.find((domain) =>
    domain.value === selectedDomain || domain.children?.some((child) => child.value === selectedDomain)
  );
  const [expanded, setExpanded] = useState<string | null>(selectedGroup?.value ?? null);
  const expandedDomain = domains.find((domain) => domain.value === expanded);

  return (
    <div className="domain-browser-nav">
      <div className="domain-browser-grid">
        <Link href="/problems" className={!selectedDomain ? "domain-browser-all active" : "domain-browser-all"}>
          All domains
        </Link>
        {domains.map((domain) => {
          const isSelected = selectedDomain === domain.value;
          const isExpanded = expanded === domain.value;
          const hasSelectedChild = domain.children?.some((child) => child.value === selectedDomain);
          const hasChildren = Boolean(domain.children?.length);

          return (
            <div key={domain.value} className={hasSelectedChild ? "domain-browser-group has-selected-child" : "domain-browser-group"}>
              <Link
                href={`/problems?domain=${domain.value}`}
                className={isSelected ? "domain-browser-main active" : "domain-browser-main"}
              >
                {domain.label}
              </Link>
              <button
                type="button"
                className={isExpanded ? "domain-browser-expand active" : "domain-browser-expand"}
                aria-expanded={isExpanded}
                aria-label={`Show ${domain.label} subdomains`}
                disabled={!hasChildren}
                onClick={() => setExpanded(isExpanded ? null : domain.value)}
              >
                {isExpanded ? "^" : "v"}
              </button>
            </div>
          );
        })}
      </div>

      {expandedDomain?.children?.length ? (
        <div className="domain-browser-subdomains">
          <div className="domain-browser-subdomains-heading">{expandedDomain.label} subdomains</div>
          <div className="domain-browser-subdomains-grid">
            {expandedDomain.children.map((child) => (
              <Link
                key={child.value}
                href={`/problems?domain=${child.value}`}
                className={selectedDomain === child.value ? "active" : undefined}
              >
                {child.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
