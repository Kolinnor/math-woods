"use client";

import { GripVertical, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from "react";

export type TipPickerProblem = {
  id: number;
  title: string;
  slug: string;
  domainLabel: string;
  difficulty: number | null;
};

type TipProblemPickerProps = {
  initialProblems: TipPickerProblem[];
  maxProblems?: number;
};

type ProblemSuggestion = TipPickerProblem & {
  listed?: boolean;
  language?: string;
};

type SuggestResponse = {
  problems?: ProblemSuggestion[];
};

function problemMeta(problem: TipPickerProblem) {
  return [
    problem.domainLabel,
    problem.difficulty ? `difficulty ${problem.difficulty}/100` : "difficulty not set",
    problem.slug
  ].join(" / ");
}

export function TipProblemPicker({ initialProblems, maxProblems = 8 }: TipProblemPickerProps) {
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
    fetch(`/api/problems/suggest?q=${encodeURIComponent(trimmed)}&listed=1`, { signal: controller.signal })
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
  }, [canAddMore, query, selectedIds]);

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
        <input key={problem.id} type="hidden" name="problemIds" value={problem.id} />
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
              aria-label={`Move ${problem.title}. Use the up and down arrow keys to reorder.`}
              title="Drag to reorder"
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
              <span>{problemMeta(problem)}</span>
            </div>
            <button type="button" className="secondary tip-remove-problem" aria-label={`Remove ${problem.title}`} onClick={() => removeProblem(problem.id)}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
        {selectedProblems.length === 0 && <p className="muted text-sm">No practice problems selected yet.</p>}
      </div>

      <label className="grid gap-1">
        <span className="text-xs font-medium">Search problems</span>
        <div className="tip-problem-search-input">
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!canAddMore}
            placeholder={canAddMore ? "Search by title or slug" : `Maximum ${maxProblems} problems selected`}
          />
        </div>
      </label>

      {(suggestions.length > 0 || isSearching || (hasSearchQuery && canAddMore)) && (
        <div className="tip-problem-suggestion-menu">
          {isSearching && <p className="muted text-sm">Searching...</p>}
          {!isSearching &&
            suggestions.map((problem) => (
              <button key={problem.id} type="button" onClick={() => addProblem(problem)}>
                <strong>{problem.title}</strong>
                <span>{problemMeta(problem)}</span>
              </button>
            ))}
          {!isSearching && suggestions.length === 0 && <p className="muted text-sm">No matching problems.</p>}
        </div>
      )}
    </div>
  );
}
