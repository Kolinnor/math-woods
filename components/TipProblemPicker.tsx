"use client";

import type { Route } from "next";
import Link from "next/link";
import { GripVertical, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import { Difficulty } from "@/components/Difficulty";

export type TipPickerProblem = {
  id: number;
  title: string;
  slug: string;
  domainLabel: string;
  difficulty: number | null;
};

type OrderedProblemPickerLabels = {
  dragTitle: string;
  empty: string;
  maximumSelected: string;
  move: string;
  noMatches: string;
  remove: string;
  search: string;
  searchPlaceholder: string;
  searching: string;
};

type OrderedProblemPickerProps = {
  createHref?: string;
  createLabel?: string;
  createInNewTab?: boolean;
  initialProblems: TipPickerProblem[];
  inputName?: string;
  labels?: Partial<OrderedProblemPickerLabels>;
  maxProblems?: number;
  searchParams?: string;
};

type ProblemSuggestion = TipPickerProblem & {
  listed?: boolean;
  language?: string;
};

type SuggestResponse = {
  problems?: ProblemSuggestion[];
};

function ProblemMeta({ problem }: { problem: TipPickerProblem }) {
  return (
    <span className="tip-problem-meta">
      <span>{problem.domainLabel}</span>
      <span aria-hidden="true">·</span>
      <Difficulty compact value={problem.difficulty} />
    </span>
  );
}

const DEFAULT_LABELS: OrderedProblemPickerLabels = {
  dragTitle: "Drag to reorder",
  empty: "No practice problems selected yet.",
  maximumSelected: "Maximum {maximum} problems selected",
  move: "Move {title}. Use the up and down arrow keys to reorder.",
  noMatches: "No matching problems.",
  remove: "Remove {title}",
  search: "Search problems",
  searchPlaceholder: "Search by title or slug",
  searching: "Searching..."
};

function formatPickerLabel(template: string, values: { maximum?: number; title?: string }) {
  return template
    .replace("{maximum}", String(values.maximum ?? ""))
    .replace("{title}", values.title ?? "");
}

export function OrderedProblemPicker({
  createHref,
  createLabel,
  createInNewTab = false,
  initialProblems,
  inputName = "problemIds",
  labels: labelOverrides,
  maxProblems = 8,
  searchParams = ""
}: OrderedProblemPickerProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const [selectedProblems, setSelectedProblems] = useState<TipPickerProblem[]>(initialProblems);
  const [draggedProblemId, setDraggedProblemId] = useState<number | null>(null);
  const [dropTargetProblemId, setDropTargetProblemId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ProblemSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const selectedIds = useMemo(() => new Set(selectedProblems.map((problem) => problem.id)), [selectedProblems]);
  const canAddMore = selectedProblems.length < maxProblems;
  const hasSearchQuery = query.trim().length >= 2;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !canAddMore) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    const extraParams = searchParams ? `&${searchParams}` : "";
    fetch(`/api/problems/suggest?q=${encodeURIComponent(trimmed)}&listed=1${extraParams}`, {
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: SuggestResponse) => {
        setSuggestions((data.problems ?? []).filter((problem) => !selectedIds.has(problem.id)));
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSearching(false);
      });

    return () => controller.abort();
  }, [canAddMore, query, searchParams, selectedIds]);

  function addProblem(problem: ProblemSuggestion) {
    if (!canAddMore || selectedIds.has(problem.id)) return;
    setSelectedProblems((current) => [...current, problem]);
    setQuery("");
    setSuggestions([]);
  }

  function removeProblem(problemId: number) {
    setSelectedProblems((current) => current.filter((problem) => problem.id !== problemId));
  }

  function moveProblem(problemId: number, targetIndex: number) {
    setSelectedProblems((current) => {
      const sourceIndex = current.findIndex((problem) => problem.id === problemId);
      if (sourceIndex < 0) return current;

      const nextIndex = Math.max(0, Math.min(current.length - 1, targetIndex));
      if (sourceIndex === nextIndex) return current;

      const reordered = [...current];
      const [movedProblem] = reordered.splice(sourceIndex, 1);
      reordered.splice(nextIndex, 0, movedProblem);
      return reordered;
    });
  }

  function dropProblem(event: DragEvent<HTMLDivElement>, targetProblemId: number) {
    event.preventDefault();
    const transferredProblemId = Number(event.dataTransfer.getData("text/plain"));
    const sourceProblemId = draggedProblemId ?? (Number.isInteger(transferredProblemId) ? transferredProblemId : null);
    if (sourceProblemId !== null) {
      moveProblem(
        sourceProblemId,
        selectedProblems.findIndex((problem) => problem.id === targetProblemId)
      );
    }
    setDraggedProblemId(null);
    setDropTargetProblemId(null);
  }

  function moveProblemWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, problemId: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const currentIndex = selectedProblems.findIndex((problem) => problem.id === problemId);
    moveProblem(problemId, currentIndex + (event.key === "ArrowUp" ? -1 : 1));
  }

  return (
    <div className="tip-problem-picker">
      {selectedProblems.map((problem) => (
        <input key={problem.id} type="hidden" name={inputName} value={problem.id} />
      ))}

      <div className="tip-selected-problem-list">
        {selectedProblems.map((problem, index) => (
          <div
            key={problem.id}
            className={[
              "tip-selected-problem",
              draggedProblemId === problem.id ? "is-dragging" : "",
              dropTargetProblemId === problem.id && draggedProblemId !== problem.id ? "is-drop-target" : ""
            ].filter(Boolean).join(" ")}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTargetProblemId(problem.id);
            }}
            onDrop={(event) => dropProblem(event, problem.id)}
          >
            <button
              type="button"
              className="tip-problem-drag-handle"
              draggable
              aria-label={formatPickerLabel(labels.move, { title: problem.title })}
              title={labels.dragTitle}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(problem.id));
                setDraggedProblemId(problem.id);
              }}
              onDragEnd={() => {
                setDraggedProblemId(null);
                setDropTargetProblemId(null);
              }}
              onKeyDown={(event) => moveProblemWithKeyboard(event, problem.id)}
            >
              <GripVertical size={16} aria-hidden="true" />
            </button>
            <div className="tip-selected-problem-copy">
              <strong>{problem.title}</strong>
              <ProblemMeta problem={problem} />
            </div>
            <button
              type="button"
              className="secondary tip-remove-problem"
              aria-label={formatPickerLabel(labels.remove, { title: problem.title })}
              onClick={() => removeProblem(problem.id)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
        {selectedProblems.length === 0 && <p className="muted text-sm">{labels.empty}</p>}
      </div>

      <label className="grid gap-1">
        <span className="text-xs font-medium">{labels.search}</span>
        <div className="tip-problem-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!canAddMore}
            placeholder={
              canAddMore
                ? labels.searchPlaceholder
                : formatPickerLabel(labels.maximumSelected, { maximum: maxProblems })
            }
          />
        </div>
      </label>

      {createHref && createLabel && (
        <Link
          href={createHref as Route}
          className="button secondary tip-problem-create-link"
          target={createInNewTab ? "_blank" : undefined}
          rel={createInNewTab ? "noopener noreferrer" : undefined}
        >
          <Plus size={16} aria-hidden="true" />
          {createLabel}
        </Link>
      )}

      {(suggestions.length > 0 || isSearching || (hasSearchQuery && canAddMore)) && (
        <div className="tip-problem-suggestion-menu">
          {isSearching && <p className="muted text-sm">{labels.searching}</p>}
          {!isSearching &&
            suggestions.map((problem) => (
              <button key={problem.id} type="button" onClick={() => addProblem(problem)}>
                <strong>{problem.title}</strong>
                <ProblemMeta problem={problem} />
              </button>
            ))}
          {!isSearching && suggestions.length === 0 && <p className="muted text-sm">{labels.noMatches}</p>}
        </div>
      )}
    </div>
  );
}

export function TipProblemPicker(props: OrderedProblemPickerProps) {
  return <OrderedProblemPicker {...props} />;
}
