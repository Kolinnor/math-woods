"use client";

import { Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type RelatedProblem = {
  title: string;
  slug: string;
  difficulty: number | null;
  listed: boolean;
  language?: string;
};

type RelationGroup = {
  title: string;
  problems: RelatedProblem[];
};

type ProblemRelationPickerProps = {
  initialGroups?: RelationGroup[];
  excludeSlug?: string;
};

type SuggestResponse = {
  problems?: RelatedProblem[];
};

const DEFAULT_GROUP_TITLE = "Related problems";

function serializeGroups(groups: RelationGroup[]) {
  return groups
    .map((group) => {
      const title = group.title.trim();
      const slugs = group.problems.map((problem) => problem.slug).filter(Boolean);
      return title && slugs.length ? `${title}: ${slugs.join(", ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function emptyGroup(): RelationGroup {
  return { title: DEFAULT_GROUP_TITLE, problems: [] };
}

function problemMeta(problem: RelatedProblem) {
  return [
    problem.language,
    problem.difficulty ? `difficulty ${problem.difficulty}/100` : null,
    problem.listed ? null : "unlisted",
    problem.slug
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ProblemRelationPicker({ initialGroups = [], excludeSlug = "" }: ProblemRelationPickerProps) {
  const [groups, setGroups] = useState<RelationGroup[]>(
    initialGroups.length ? initialGroups.map((group) => ({ ...group, problems: [...group.problems] })) : [emptyGroup()]
  );
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RelatedProblem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const serializedGroups = useMemo(() => serializeGroups(groups), [groups]);
  const selectedSlugs = useMemo(
    () => new Set(groups.flatMap((group) => group.problems.map((problem) => problem.slug))),
    [groups]
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    fetch(`/api/problems/suggest?q=${encodeURIComponent(trimmed)}&exclude=${encodeURIComponent(excludeSlug)}`, {
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: SuggestResponse) => {
        setSuggestions((data.problems ?? []).filter((problem) => !selectedSlugs.has(problem.slug)));
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsSearching(false);
      });

    return () => controller.abort();
  }, [excludeSlug, query, selectedSlugs]);

  function updateGroupTitle(index: number, title: string) {
    setGroups((current) => current.map((group, groupIndex) => (groupIndex === index ? { ...group, title } : group)));
  }

  function addGroup() {
    setGroups((current) => [...current, emptyGroup()]);
    setActiveGroupIndex(groups.length);
  }

  function removeGroup(index: number) {
    setGroups((current) => {
      const next = current.filter((_, groupIndex) => groupIndex !== index);
      return next.length ? next : [emptyGroup()];
    });
    setActiveGroupIndex((current) => Math.max(0, Math.min(current, groups.length - 2)));
  }

  function addProblem(problem: RelatedProblem) {
    if (selectedSlugs.has(problem.slug)) return;
    setGroups((current) =>
      current.map((group, groupIndex) =>
        groupIndex === activeGroupIndex ? { ...group, problems: [...group.problems, problem] } : group
      )
    );
    setQuery("");
    setSuggestions([]);
  }

  function removeProblem(groupIndex: number, slug: string) {
    setGroups((current) =>
      current.map((group, index) =>
        index === groupIndex
          ? { ...group, problems: group.problems.filter((problem) => problem.slug !== slug) }
          : group
      )
    );
  }

  return (
    <div className="problem-relation-picker">
      <input type="hidden" name="relatedProblemGroups" value={serializedGroups} />
      <div className="problem-relation-picker-header">
        <div>
          <span className="text-sm font-medium">Related problem boxes</span>
          <p className="muted text-xs">Give each box a short label, then add problems by title or slug.</p>
        </div>
        <button type="button" className="secondary relation-add-group-button" onClick={addGroup}>
          <Plus size={15} aria-hidden="true" />
          <span>Box</span>
        </button>
      </div>

      <div className="relation-group-list">
        {groups.map((group, groupIndex) => (
          <div key={groupIndex} className="relation-group-editor">
            <div className="relation-group-title-row">
              <label className="grid gap-1">
                <span className="text-xs font-medium">Box label</span>
                <input
                  value={group.title}
                  onChange={(event) => updateGroupTitle(groupIndex, event.target.value)}
                  onFocus={() => setActiveGroupIndex(groupIndex)}
                  placeholder="An easier problem"
                />
              </label>
              <button
                type="button"
                className="secondary relation-remove-button"
                aria-label="Remove this related problem box"
                onClick={() => removeGroup(groupIndex)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>

            <div className="relation-selected-list">
              {group.problems.map((problem) => (
                <div key={problem.slug} className="relation-selected-problem">
                  <div>
                    <strong>{problem.title}</strong>
                    <span>{problemMeta(problem)}</span>
                  </div>
                  <button
                    type="button"
                    className="secondary relation-remove-button"
                    aria-label={`Remove ${problem.title}`}
                    onClick={() => removeProblem(groupIndex, problem.slug)}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
              {group.problems.length === 0 && <p className="muted text-sm">No problems in this box yet.</p>}
            </div>
          </div>
        ))}
      </div>

      <div className="relation-search">
        <label className="grid gap-1">
          <span className="text-xs font-medium">Add to selected box</span>
          <div className="relation-search-input">
            <Search size={16} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search for a problem to add to "${groups[activeGroupIndex]?.title || DEFAULT_GROUP_TITLE}"`}
            />
          </div>
        </label>
        {(suggestions.length > 0 || isSearching) && (
          <div className="relation-suggestion-menu">
            {isSearching && <p className="muted text-sm">Searching...</p>}
            {!isSearching &&
              suggestions.map((problem) => (
                <button key={problem.slug} type="button" onClick={() => addProblem(problem)}>
                  <strong>{problem.title}</strong>
                  <span>{problemMeta(problem)}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
