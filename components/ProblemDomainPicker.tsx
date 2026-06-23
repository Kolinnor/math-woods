"use client";

import { useState } from "react";
import type { MathDomain } from "@prisma/client";

const MAX_PROBLEM_DOMAINS = 3;

type DomainOption = {
  value: MathDomain;
  label: string;
};

type ProblemDomainPickerProps = {
  domains: DomainOption[];
  initialValues: MathDomain[];
};

export function ProblemDomainPicker({ domains, initialValues }: ProblemDomainPickerProps) {
  const initial = initialValues.length ? initialValues.slice(0, MAX_PROBLEM_DOMAINS) : [domains[0]?.value];
  const [values, setValues] = useState(initial.filter(Boolean) as MathDomain[]);

  function updateValue(index: number, value: MathDomain) {
    setValues((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function addDomain() {
    const fallback = domains.find((domain) => !values.includes(domain.value))?.value ?? domains[0]?.value;
    if (!fallback) return;
    setValues((current) => [...current, fallback].slice(0, MAX_PROBLEM_DOMAINS));
  }

  function removeDomain(index: number) {
    setValues((current) => current.filter((_, itemIndex) => itemIndex !== index));
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
        {values.map((value, index) => (
          <div key={`${index}-${value}`} className="domain-picker-row">
            <select
              name="domains"
              value={value}
              aria-label={index === 0 ? "Primary domain" : `Additional domain ${index + 1}`}
              onChange={(event) => updateValue(index, event.target.value as MathDomain)}
            >
              {domains.map((domain) => (
                <option key={domain.value} value={domain.value}>
                  {domain.label}
                </option>
              ))}
            </select>
            {index > 0 && (
              <button
                type="button"
                className="secondary domain-remove-button"
                aria-label="Remove this domain"
                onClick={() => removeDomain(index)}
              >
                -
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="muted text-xs">Choose up to {MAX_PROBLEM_DOMAINS}. The first one is the main domain.</p>
    </div>
  );
}
