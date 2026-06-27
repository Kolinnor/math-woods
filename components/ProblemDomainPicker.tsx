"use client";

import { useState } from "react";
import type { DomainOption } from "@/lib/domains";

const MAX_PROBLEM_DOMAINS = 3;

type ProblemDomainPickerProps = {
  domains: DomainOption[];
  initialValues: string[];
  initialSpoilers?: string[];
};

function findOption(domains: DomainOption[], value: string) {
  const normalized = value.trim().toUpperCase();
  return domains
    .flatMap((domain) => [domain, ...(domain.children ?? [])])
    .find((domain) => domain.value.toUpperCase() === normalized || domain.aliases?.some((alias) => alias.toUpperCase() === normalized));
}

export function ProblemDomainPicker({ domains, initialValues, initialSpoilers = [] }: ProblemDomainPickerProps) {
  const initial = initialValues.length
    ? initialValues.map((value) => findOption(domains, value)?.value ?? value).slice(0, MAX_PROBLEM_DOMAINS)
    : [domains[0]?.value];
  const [values, setValues] = useState(initial.filter(Boolean));
  const [spoilers, setSpoilers] = useState(() => new Set(initialSpoilers.map((value) => findOption(domains, value)?.value ?? value)));
  const [expanded, setExpanded] = useState<string | null>(null);

  function updateValue(index: number, value: string) {
    const previous = values[index];
    setSpoilers((current) => {
      const next = new Set(current);
      if (next.delete(previous)) next.add(value);
      return next;
    });
    setValues((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addDomain() {
    const used = new Set(values);
    const fallback = domains.flatMap((domain) => [domain, ...(domain.children ?? [])]).find((domain) => !used.has(domain.value));
    if (!fallback) return;
    setValues((current) => [...current, fallback.value].slice(0, MAX_PROBLEM_DOMAINS));
  }

  function removeDomain(index: number) {
    const removed = values[index];
    setSpoilers((current) => {
      const next = new Set(current);
      next.delete(removed);
      return next;
    });
    setValues((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function toggleSpoiler(value: string, checked: boolean) {
    setSpoilers((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(value);
      } else {
        next.delete(value);
      }
      return next;
    });
  }

  return (
    <div className="domain-picker">
      <div className="domain-picker-header">
        <span className="text-sm font-medium">Domains</span>
        {values.length < MAX_PROBLEM_DOMAINS && (
          <button type="button" className="secondary domain-add-button" onClick={addDomain}>
            + domain
          </button>
        )}
      </div>
      <div className="domain-picker-list">
        {values.map((value, index) => {
          const selected = findOption(domains, value);

          return (
            <div key={`${index}-${value}`} className="domain-picker-row">
              <input type="hidden" name="domains" value={value} />
              <div className="domain-choice-panel">
                <div className="domain-choice-current">
                  <span>{selected?.label ?? "Other"}</span>
                  {values.length > 1 && (
                    <button
                      type="button"
                      className="secondary domain-remove-button"
                      aria-label="Remove this domain"
                      onClick={() => removeDomain(index)}
                    >
                      <span aria-hidden="true" />
                    </button>
                  )}
                </div>
                <label className="domain-spoiler-toggle">
                  <input
                    name="domainSpoilers"
                    type="checkbox"
                    value={value}
                    checked={spoilers.has(value)}
                    onChange={(event) => toggleSpoiler(value, event.target.checked)}
                  />
                  <span>Hide this domain until solved</span>
                </label>
                <div className="domain-choice-grid">
                  {domains.map((domain) => {
                    const isExpanded = expanded === `${index}:${domain.value}`;
                    const hasChildren = Boolean(domain.children?.length);

                    return (
                      <div key={domain.value} className="domain-choice">
                        <button
                          type="button"
                          className={value === domain.value ? "domain-main-button domain-selected" : "domain-main-button"}
                          onClick={() => updateValue(index, domain.value)}
                        >
                          {domain.label}
                        </button>
                        {hasChildren && (
                          <button
                            type="button"
                            className="domain-expand-button"
                            aria-expanded={isExpanded}
                            aria-label={`Show ${domain.label} subdomains`}
                            onClick={() => setExpanded(isExpanded ? null : `${index}:${domain.value}`)}
                          >
                            {isExpanded ? "^" : "v"}
                          </button>
                        )}
                        {isExpanded && (
                          <div className="domain-subchoices">
                            {domain.children!.map((child) => (
                              <button
                                key={child.value}
                                type="button"
                                className={value === child.value ? "domain-subchoice domain-selected" : "domain-subchoice"}
                                onClick={() => updateValue(index, child.value)}
                              >
                                {child.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted text-xs">
        Choose up to {MAX_PROBLEM_DOMAINS}. Click a main domain for a quick choice, or open the arrow for MSC subdomains.
      </p>
    </div>
  );
}
