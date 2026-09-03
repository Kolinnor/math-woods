"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MatrixGlyph } from "@/components/MatrixGlyph";
import { TopologyBlobGlyph } from "@/components/TopologyBlobGlyph";
import type { DomainOption, ProblemDomainFamily, ProblemDomainOption } from "@/lib/domains";
import type { Dictionary, InterfaceLocale } from "@/lib/i18n/types";

const MAX_PROBLEM_DOMAINS = 3;
const DOMAIN_FAMILY_COLORS: Record<ProblemDomainFamily, string> = {
  found: "#3f6b45",
  geom: "#a87f2e",
  ana: "#2f6f6a",
  prob: "#3d5f7a",
  app: "#a13a3a",
  other: "#1f1f1f"
};

type ProblemDomainPickerProps = {
  domains: DomainOption[];
  initialValues: string[];
  initialSpoilers?: string[];
  inputName?: string;
  labels: Dictionary["problems"]["domainPicker"];
  label?: string;
  locale: InterfaceLocale;
  maxDomains?: number;
  showSubdomains?: boolean;
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

function template(value: string, key: string, replacement: string | number) {
  return value.replace(`{${key}}`, String(replacement));
}

export function ProblemDomainPicker({
  domains,
  initialValues,
  initialSpoilers = [],
  inputName = "domains",
  labels,
  label,
  locale,
  maxDomains = MAX_PROBLEM_DOMAINS,
  showSubdomains = false,
  showSpoilerToggle = true,
  helpText
}: ProblemDomainPickerProps) {
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const subdomainMenuRef = useRef<HTMLDivElement | null>(null);
  const initial = initialValues.length
    ? initialValues.map((value) => findOption(domains, value)?.value ?? value).slice(0, maxDomains)
    : [domains[0]?.value];
  const [values, setValues] = useState(initial.filter(Boolean));
  const [spoilers, setSpoilers] = useState(() => new Set(initialSpoilers.map((value) => findOption(domains, value)?.value ?? value)));
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const selectedOptions = values.map((value) => findOption(domains, value)).filter(Boolean) as DomainOption[];
  const selectedSet = new Set(values);

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      const picker = pickerRef.current;
      const target = event.target;
      if (picker && target instanceof Node && !picker.contains(target)) setExpandedDomain(null);
    }

    function closeMenuWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedDomain(null);
    }

    document.addEventListener("pointerdown", closeMenu, true);
    document.addEventListener("keydown", closeMenuWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeMenu, true);
      document.removeEventListener("keydown", closeMenuWithKeyboard);
    };
  }, []);

  useEffect(() => {
    const menu = subdomainMenuRef.current;
    if (!expandedDomain || !menu) return;
    let animationFrame = 0;

    function keepMenuInsideViewport() {
      const currentMenu = subdomainMenuRef.current;
      if (!currentMenu) return;
      currentMenu.style.transform = "";
      const bounds = currentMenu.getBoundingClientRect();
      const viewportMargin = 12;
      const leftShift = Math.max(0, viewportMargin - bounds.left);
      const rightShift = Math.max(0, bounds.right - (window.innerWidth - viewportMargin));
      currentMenu.style.transform = `translateX(${leftShift - rightShift}px)`;
    }

    animationFrame = window.requestAnimationFrame(keepMenuInsideViewport);
    window.addEventListener("resize", keepMenuInsideViewport);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", keepMenuInsideViewport);
    };
  }, [expandedDomain]);

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
    <div ref={pickerRef} className="domain-picker">
      <div className="domain-picker-header">
        <span className="text-sm font-medium">{label ?? labels.domains}</span>
        {maxDomains > 1 && <span className="domain-picker-count">{values.length}/{maxDomains}</span>}
      </div>
      {values.map((value) => (
        <input key={value} type="hidden" name={inputName} value={value} />
      ))}
      <div className="domain-picker-grid">
        {domains.map((domain) => {
          const selected = selectedSet.has(domain.value);
          const hasSelectedChild = domain.children?.some((child) => selectedSet.has(child.value)) ?? false;
          const hasChildren = showSubdomains && Boolean(domain.children?.length);
          const color = isProblemDomainOption(domain) ? DOMAIN_FAMILY_COLORS[domain.family] : undefined;
          const glyph = isProblemDomainOption(domain) ? domain.glyph : domain.label.charAt(0);
          const isExpanded = expandedDomain === domain.value;
          return (
            <div
              key={domain.value}
              className={isExpanded ? "domain-picker-tile-shell is-expanded" : "domain-picker-tile-shell"}
            >
              <button
                type="button"
                className={
                  selected
                    ? "domain-picker-tile selected"
                    : hasSelectedChild
                      ? "domain-picker-tile has-selected-child"
                      : "domain-picker-tile"
                }
                aria-pressed={selected}
                onClick={() => {
                  selectDomain(domain.value);
                  setExpandedDomain(null);
                }}
              >
                <span className="domain-picker-glyph" style={color ? { backgroundColor: color } : undefined}>
                  {domain.value === "general-topology" && color ? (
                    <TopologyBlobGlyph fill={color} />
                  ) : domain.value === "linear-algebra" ? (
                    <MatrixGlyph />
                  ) : domain.value === "computation" ? (
                    <span style={{ display: "inline-block", transform: "translate(-1.5px, 1.5px)" }}>{glyph}</span>
                  ) : (
                    glyph
                  )}
                </span>
                <span>{domain.label}</span>
              </button>
              {hasChildren && (
                <button
                  type="button"
                  className={isExpanded ? "domain-picker-expand active" : "domain-picker-expand"}
                  aria-expanded={isExpanded}
                  aria-label={template(labels.showSubdomains, "domain", domain.label)}
                  title={template(labels.showSubdomains, "domain", domain.label)}
                  onClick={() => setExpandedDomain((current) => current === domain.value ? null : domain.value)}
                >
                  <ChevronDown size={12} aria-hidden="true" />
                </button>
              )}
              {isExpanded && domain.children?.length ? (
                <div ref={subdomainMenuRef} className="domain-picker-subdomain-menu">
                  {[...domain.children]
                    .sort((left, right) => left.label.localeCompare(right.label, locale))
                    .map((subdomain) => (
                      <button
                        key={subdomain.value}
                        type="button"
                        className={selectedSet.has(subdomain.value) ? "selected" : undefined}
                        aria-pressed={selectedSet.has(subdomain.value)}
                        onClick={() => {
                          selectDomain(subdomain.value);
                          setExpandedDomain(null);
                        }}
                      >
                        {subdomain.label}
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
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
              <span>{template(labels.hiddenUntilSolved, "domain", selected.label)}</span>
            </label>
          ))}
        </div>
      )}
      {helpText !== null && (
        <p className="muted text-xs">{helpText ?? template(labels.chooseUpTo, "count", maxDomains)}</p>
      )}
    </div>
  );
}
