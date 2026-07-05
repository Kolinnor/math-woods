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
  labels?: AdvancedFilterLabels;
  statuses: Option[];
  tags: Option[];
};

type AdvancedFilterLabels = {
  title: string;
  activeSingular: string;
  activePlural: string;
  optional: string;
  description: string;
  addFilter: string;
  logicAriaLabel: string;
  fieldAriaLabel: string;
  operatorAriaLabel: string;
  valueAriaLabel: string;
  choose: string;
  valuePlaceholder: string;
  removeFilter: string;
  empty: string;
  fields: Record<"text" | "title" | "body" | "tag" | "domain" | "status" | "difficulty" | "origin", string>;
  ops: Record<"contains" | "isExactly" | "is" | "atLeast" | "atMost", string>;
};

const defaultLabels: AdvancedFilterLabels = {
  title: "Advanced filters",
  activeSingular: "active",
  activePlural: "active",
  optional: "Optional AND / OR filters",
  description: "Build a small query with AND / OR.",
  addFilter: "Add filter",
  logicAriaLabel: "Filter logic",
  fieldAriaLabel: "Filter field",
  operatorAriaLabel: "Filter operator",
  valueAriaLabel: "Filter value",
  choose: "Choose...",
  valuePlaceholder: "Value",
  removeFilter: "Remove filter",
  empty: "No advanced filter yet.",
  fields: {
    text: "Text",
    title: "Title",
    body: "Statement",
    tag: "Tag",
    domain: "Domain",
    status: "Status",
    difficulty: "Difficulty",
    origin: "Origin"
  },
  ops: {
    contains: "contains",
    isExactly: "is exactly",
    is: "is",
    atLeast: "is at least",
    atMost: "is at most"
  }
};

function fieldsFor(labels: AdvancedFilterLabels) {
  return [
    { value: "text", label: labels.fields.text },
    { value: "title", label: labels.fields.title },
    { value: "body", label: labels.fields.body },
    { value: "tag", label: labels.fields.tag },
    { value: "domain", label: labels.fields.domain },
    { value: "status", label: labels.fields.status },
    { value: "difficulty", label: labels.fields.difficulty },
    { value: "origin", label: labels.fields.origin }
  ];
}

function operatorsFor(field: string, labels: AdvancedFilterLabels) {
  const textOps = [
    { value: "contains", label: labels.ops.contains },
    { value: "is", label: labels.ops.isExactly }
  ];
  const exactOps = [{ value: "is", label: labels.ops.is }];
  const difficultyOps = [
    { value: "is", label: labels.ops.is },
    { value: "atLeast", label: labels.ops.atLeast },
    { value: "atMost", label: labels.ops.atMost }
  ];

  if (field === "difficulty") return difficultyOps;
  if (field === "domain" || field === "status" || field === "tag") return exactOps;
  return textOps;
}

function defaultOperator(field: string, labels: AdvancedFilterLabels) {
  return operatorsFor(field, labels)[0].value;
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
  labels = defaultLabels,
  statuses,
  tags
}: ProblemFilterBuilderProps) {
  const rootRef = useRef<HTMLDetailsElement>(null);
  const [panelOpen, setPanelOpen] = useState(initialFilters.length > 0);
  const [logic, setLogic] = useState(initialLogic);
  const [rows, setRows] = useState<ProblemFilterRow[]>(initialFilters);
  const activeCount = rows.filter((row) => row.value.trim()).length;
  const activeLabel = activeCount === 1 ? labels.activeSingular : labels.activePlural;
  const fields = fieldsFor(labels);

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
          <strong>{labels.title}</strong>
          <small>{activeCount ? `${activeCount} ${activeLabel}` : labels.optional}</small>
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </summary>

      <div className="advanced-filter-content">
        <div className="advanced-filter-header">
          <p className="muted">{labels.description}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setRows((current) => [...current, emptyRow()])}
          >
            <Plus size={16} aria-hidden="true" />
            {labels.addFilter}
          </button>
        </div>

        <div className="filter-logic" role="radiogroup" aria-label={labels.logicAriaLabel}>
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
              const operators = operatorsFor(row.field, labels);
              const valueOptions = valueOptionsFor(row.field, domains, statuses, tags);
              const op = operators.some((item) => item.value === row.op) ? row.op : defaultOperator(row.field, labels);

              return (
                <div className="advanced-filter-row" key={index}>
                  <select
                    name="filterField"
                    value={row.field}
                    aria-label={labels.fieldAriaLabel}
                    onChange={(event) => {
                      const field = event.target.value;
                      updateRow(index, { field, op: defaultOperator(field, labels), value: "" });
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
                    aria-label={labels.operatorAriaLabel}
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
                      aria-label={labels.valueAriaLabel}
                      onChange={(event) => updateRow(index, { ...row, value: event.target.value })}
                    >
                      <option value="">{labels.choose}</option>
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
                      placeholder={row.field === "difficulty" ? "1-100" : labels.valuePlaceholder}
                      aria-label={labels.valueAriaLabel}
                      onChange={(event) => updateRow(index, { ...row, value: event.target.value })}
                    />
                  )}

                  <button
                    type="button"
                    className="icon-button secondary"
                    aria-label={labels.removeFilter}
                    title={labels.removeFilter}
                    onClick={() => removeRow(index)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="advanced-filter-empty">{labels.empty}</p>
        )}
      </div>
    </details>
  );
}
