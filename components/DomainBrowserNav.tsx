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

  return (
    <div className="domain-browser-nav">
      <Link href="/problems" className={!selectedDomain ? "domain-browser-all active" : "domain-browser-all"}>
        All domains
      </Link>
      {domains.map((domain) => {
        const isSelected = selectedDomain === domain.value;
        const isExpanded = expanded === domain.value;
        const hasChildren = Boolean(domain.children?.length);

        return (
          <div key={domain.value} className="domain-browser-group">
            <Link href={`/problems?domain=${domain.value}`} className={isSelected ? "domain-browser-main active" : "domain-browser-main"}>
              {domain.label}
            </Link>
            {hasChildren && (
              <button
                type="button"
                className="domain-browser-expand"
                aria-expanded={isExpanded}
                aria-label={`Show ${domain.label} subdomains`}
                onClick={() => setExpanded(isExpanded ? null : domain.value)}
              >
                {isExpanded ? "^" : "v"}
              </button>
            )}
            {isExpanded && (
              <div className="domain-browser-subdomains">
                {domain.children!.map((child) => (
                  <Link
                    key={child.value}
                    href={`/problems?domain=${child.value}`}
                    className={selectedDomain === child.value ? "active" : undefined}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
