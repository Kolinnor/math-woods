"use client";

import { useState } from "react";
import type { DomainOption, ProblemDomainFamily, ProblemDomainOption } from "@/lib/domains";

const MAX_PROBLEM_DOMAINS = 3;
const DOMAIN_FAMILY_COLORS: Record<ProblemDomainFamily, string> = {
  found: "#3f6b45",
  geom: "#a87f2e",
  ana: "#2f6f6a",
  prob: "#3d5f7a",
  app: "#a85f33",
  other: "#1f1f1f"
};

type ProblemDomainPickerProps = {
  domains: DomainOption[];
  initialValues: string[];
  initialSpoilers?: string[];
  inputName?: string;
  label?: string;
  maxDomains?: number;
  showSpoilerToggle?: boolean;
  helpText?: string | null;
};

function isProblemDomainOption(domain: DomainOption): domain is ProblemDomainOption {
  return "glyph" in domain && "family" in domain;
}

function findOption(domains: DomainOption[], value: string) {
  const normalized = value.trim().toUpperCase();
  return domains
    .flatMap((domain) => [domain, ...(domain.children ?? [])])
    .find((domain) => domain.value.toUpperCase() === normalized || domain.aliases?.some((alias) => alias.toUpperCase() === normalized));
}

export function ProblemDomainPicker({
  domains,
  initialValues,
  initialSpoilers = [],
  inputName = "domains",
  label = "Domains",
  maxDomains = MAX_PROBLEM_DOMAINS,
  showSpoilerToggle = true,
  helpText
}: ProblemDomainPickerProps) {
  const initial = initialValues.length
    ? initialValues.map((value) => findOption(domains, value)?.value ?? value).slice(0, maxDomains)
    : [domains[0]?.value];
  const [values, setValues] = useState(initial.filter(Boolean));
  const [spoilers, setSpoilers] = useState(() => new Set(initialSpoilers.map((value) => findOption(domains, value)?.value ?? value)));
  const selectedOptions = values.map((value) => findOption(domains, value)).filter(Boolean) as DomainOption[];
  const selectedSet = new Set(values);

  function pruneSpoilers(nextValues: string[]) {
    setSpoilers((current) => {
      const allowed = new Set(nextValues);
      const next = new Set(current);
      for (const value of next) {
        if (!allowed.has(value)) next.delete(value);
      }
      return next;
    });
  }

  function selectDomain(value: string) {
    setValues((current) => {
      let next: string[];
      if (maxDomains === 1) {
        next = [value];
      } else if (current.includes(value)) {
        next = current.length > 1 ? current.filter((item) => item !== value) : current;
      } else {
        const withoutDefaultOther = current.length === 1 && current[0] === "other" && value !== "other" ? [] : current;
        next = [...withoutDefaultOther, value].slice(0, maxDomains);
      }
      pruneSpoilers(next);
      return next;
    });
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
        <span className="text-sm font-medium">{label}</span>
        {maxDomains > 1 && <span className="domain-picker-count">{values.length}/{maxDomains}</span>}
      </div>
      {values.map((value) => (
        <input key={value} type="hidden" name={inputName} value={value} />
      ))}
      <div className="domain-picker-grid">
        {domains.map((domain) => {
          const selected = selectedSet.has(domain.value);
          const color = isProblemDomainOption(domain) ? DOMAIN_FAMILY_COLORS[domain.family] : undefined;
          const glyph = isProblemDomainOption(domain) ? domain.glyph : domain.label.charAt(0);
          return (
            <button
              key={domain.value}
              type="button"
              className={selected ? "domain-picker-tile selected" : "domain-picker-tile"}
              aria-pressed={selected}
              onClick={() => selectDomain(domain.value)}
            >
              <span className="domain-picker-glyph" style={color ? { backgroundColor: color } : undefined}>
                {glyph}
              </span>
              <span>{domain.label}</span>
            </button>
          );
        })}
      </div>
      {showSpoilerToggle && selectedOptions.length > 0 && (
        <div className="domain-spoiler-grid">
          {selectedOptions.map((selected) => (
            <label key={selected.value} className="domain-spoiler-toggle">
              <input
                name="domainSpoilers"
                type="checkbox"
                value={selected.value}
                checked={spoilers.has(selected.value)}
                onChange={(event) => toggleSpoiler(selected.value, event.target.checked)}
              />
              <span>{selected.label} hidden until solved</span>
            </label>
          ))}
        </div>
      )}
      {helpText !== null && <p className="muted text-xs">{helpText ?? `Choose up to ${maxDomains} domains.`}</p>}
    </div>
  );
}
