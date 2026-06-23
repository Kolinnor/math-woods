"use client";

import { ChevronDown, Plus, X } from "lucide-react";
import { useRef, useState } from "react";

export type ProblemFilterRow = {
  field: string;
  op: string;
  value: string;
};

type Option = {
  value: string;
  label: string;
};

type ProblemFilterBuilderProps = {
  domains: Option[];
  initialFilters: ProblemFilterRow[];
  initialLogic: "AND" | "OR";
  statuses: Option[];
  tags: Option[];
};

const fields = [
  { value: "text", label: "Text" },
  { value: "title", label: "Title" },
  { value: "body", label: "Statement" },
  { value: "tag", label: "Tag" },
  { value: "domain", label: "Domain" },
  { value: "status", label: "Status" },
  { value: "difficulty", label: "Difficulty" },
  { value: "origin", label: "Origin" }
];

const textOps = [
  { value: "contains", label: "contains" },
  { value: "is", label: "is exactly" }
];

const exactOps = [{ value: "is", label: "is" }];

const difficultyOps = [
  { value: "is", label: "is" },
  { value: "atLeast", label: "is at least" },
  { value: "atMost", label: "is at most" }
];

function operatorsFor(field: string) {
  if (field === "difficulty") return difficultyOps;
  if (field === "domain" || field === "status" || field === "tag") return exactOps;
  return textOps;
}

function defaultOperator(field: string) {
  return operatorsFor(field)[0].value;
}

function valueOptionsFor(field: string, domains: Option[], statuses: Option[], tags: Option[]) {
  if (field === "domain") return domains;
  if (field === "status") return statuses;
  if (field === "tag") return tags;
  return [];
}

function emptyRow(): ProblemFilterRow {
  return { field: "text", op: "contains", value: "" };
}

export function ProblemFilterBuilder({
  domains,
  initialFilters,
  initialLogic,
  statuses,
  tags
}: ProblemFilterBuilderProps) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const [panelOpen, setPanelOpen] = useState(initialFilters.length > 0);
  const [logic, setLogic] = useState(initialLogic);
  const [rows, setRows] = useState<ProblemFilterRow[]>(initialFilters);
  const activeCount = rows.filter((row) => row.value.trim()).length;

  const submitSoon = () => {
    window.setTimeout(() => rootRef.current?.closest("form")?.requestSubmit(), 0);
  };

  const updateRow = (index: number, nextRow: ProblemFilterRow) => {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? nextRow : row)));
  };

  const removeRow = (index: number) => {
    setRows((current) => current.filter((_row, rowIndex) => rowIndex !== index));
    submitSoon();
  };

  return (
    <details
      ref={rootRef}
      className="advanced-filter-builder"
      open={panelOpen}
      onToggle={(event) => setPanelOpen(event.currentTarget.open)}
    >
      <input type="hidden" name="filterField" value="" />
      <input type="hidden" name="filterOp" value="" />
      <input type="hidden" name="filterValue" value="" />

      <summary className="advanced-filter-summary">
        <span>
          <strong>Advanced filters</strong>
          <small>{activeCount ? `${activeCount} active` : "Optional AND / OR filters"}</small>
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>

      <div className="advanced-filter-content">
        <div className="advanced-filter-header">
          <p className="muted">Build a small query with AND / OR.</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setRows((current) => [...current, emptyRow()])}
          >
            <Plus size={16} aria-hidden="true" />
            Add filter
          </button>
        </div>

        <div className="filter-logic" role="radiogroup" aria-label="Filter logic">
          {(["AND", "OR"] as const).map((value) => (
            <label key={value} className={logic === value ? "active" : ""}>
              <input
                type="radio"
                name="filterLogic"
                value={value}
                checked={logic === value}
                onChange={() => setLogic(value)}
              />
              {value}
            </label>
          ))}
        </div>

        {rows.length > 0 ? (
          <div className="advanced-filter-rows">
            {rows.map((row, index) => {
              const operators = operatorsFor(row.field);
              const valueOptions = valueOptionsFor(row.field, domains, statuses, tags);
              const op = operators.some((item) => item.value === row.op) ? row.op : defaultOperator(row.field);

              return (
                <div className="advanced-filter-row" key={index}>
                  <select
                    name="filterField"
                    value={row.field}
                    aria-label="Filter field"
                    onChange={(event) => {
                      const field = event.target.value;
                      updateRow(index, { field, op: defaultOperator(field), value: "" });
                    }}
                  >
                    {fields.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>

                  <select
                    name="filterOp"
                    value={op}
                    aria-label="Filter operator"
                    onChange={(event) => updateRow(index, { ...row, op: event.target.value })}
                  >
                    {operators.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>

                  {valueOptions.length > 0 ? (
                    <select
                      name="filterValue"
                      value={row.value}
                      aria-label="Filter value"
                      onChange={(event) => updateRow(index, { ...row, value: event.target.value })}
                    >
                      <option value="">Choose...</option>
                      {valueOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      name="filterValue"
                      type={row.field === "difficulty" ? "number" : "text"}
                      min={row.field === "difficulty" ? 1 : undefined}
                      max={row.field === "difficulty" ? 100 : undefined}
                      value={row.value}
                      placeholder={row.field === "difficulty" ? "1-100" : "Value"}
                      aria-label="Filter value"
                      onChange={(event) => updateRow(index, { ...row, value: event.target.value })}
                    />
                  )}

                  <button
                    type="button"
                    className="icon-button secondary"
                    aria-label="Remove filter"
                    title="Remove filter"
                    onClick={() => removeRow(index)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="advanced-filter-empty">No advanced filter yet.</p>
        )}
      </div>
    </details>
  );
}
