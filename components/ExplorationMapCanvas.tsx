"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useUpdateNodeInternals,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { AlertTriangle, CircleCheck, ExternalLink, Flag, GitBranch, LayoutGrid, Link2, Play, Plus, RotateCcw, Square, Trash2, Unlink } from "lucide-react";
import {
  createExplorationCanvasChoiceAction,
  createExplorationPageAction,
  createExplorationQuizOutcomeAction,
  deleteExplorationCanvasPageAction,
  deleteExplorationQuizOutcomeAction,
  setExplorationContinueAction,
  updateExplorationCanvasChoiceAction,
  updateExplorationQuizOutcomeAction,
  updateExplorationCanvasPositionsAction
} from "@/lib/actions/exploration-actions";
import { reachableExplorationPageIds } from "@/lib/exploration-map-analysis";

export type ExplorationMapChoice = {
  id: number;
  blockId: number;
  label: string;
  position: number;
  toPageId: number | null;
};

export type ExplorationMapQuizOption = {
  id: number;
  isCorrect: boolean | null;
  label: string;
};

export type ExplorationMapQuizOutcome = {
  id: number;
  kind: "ANSWER" | "CORRECT" | "INCORRECT" | "COMBINATION";
  label: string;
  optionIds: number[];
  position: number;
  toPageId: number | null;
};

export type ExplorationMapQuiz = {
  blockId: number;
  blockPosition: number;
  outcomes: ExplorationMapQuizOutcome[];
  options: ExplorationMapQuizOption[];
  quizType: string | null;
  title: string;
};

export type ExplorationMapPage = {
  id: number;
  slug: string;
  title: string;
  position: number;
  isStart: boolean;
  canvasX: number | null;
  canvasY: number | null;
  continueToPageId: number | null;
  blockCount: number;
  choices: ExplorationMapChoice[];
  quizzes: ExplorationMapQuiz[];
  warnings: string[];
};

type PageNodeOutput = {
  handleId: string;
  kind: "choice" | "quiz";
  label: string;
};

type PageNodeData = {
  editHref: string;
  isStart: boolean;
  position: number;
  outputs: PageNodeOutput[];
  terminal: boolean;
  title: string;
  unreachable: boolean;
};

type PageFlowNode = Node<PageNodeData, "explorationPage">;
type LinkData =
  | { kind: "continue"; pageId: number }
  | { kind: "choice"; optionId: number; pageId: number }
  | { kind: "quiz"; outcomeId: number; pageId: number };
type DeleteTarget =
  | { kind: "page"; pageId: number; title: string }
  | { kind: "quizOutcome"; label: string; outcomeId: number }
  | { kind: "continue"; pageId: number; sourceTitle: string; targetTitle: string }
  | { kind: "choice"; label: string; optionId: number; pageId: number; sourceTitle: string; targetTitle: string }
  | { kind: "quiz"; label: string; outcomeId: number; pageId: number; sourceTitle: string; targetTitle: string };

function fallbackPosition(index: number) {
  return { x: (index % 4) * 320, y: Math.floor(index / 4) * 220 };
}

function pageHasOutgoingLink(page: ExplorationMapPage) {
  return page.continueToPageId !== null
    || page.choices.some((choice) => choice.toPageId !== null)
    || page.quizzes.some((quiz) => quiz.outcomes.some((outcome) => outcome.toPageId !== null));
}

function PageNode({ data, id, selected }: NodeProps<PageFlowNode>) {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => updateNodeInternals(id), [data.outputs.length, id, selected, updateNodeInternals]);

  return (
    <article className={selected ? "exploration-map-node is-selected" : "exploration-map-node"}>
      <Handle className="exploration-map-handle" type="target" position={Position.Top} />
      <div className="exploration-map-node-heading">
        <span>Page {data.position}</span>
        {data.isStart && <strong><Flag size={12} /> Start</strong>}
        {data.terminal && <strong className="is-terminal"><CircleCheck size={12} /> End</strong>}
        {data.unreachable && <span aria-label="Unreachable page" className="exploration-map-node-warning" title="This page cannot be reached from the starting page"><AlertTriangle size={13} /></span>}
      </div>
      <h3>{data.title}</h3>
      <div className={selected ? "exploration-map-node-outputs is-open" : "exploration-map-node-outputs"}>
        {data.outputs.map((output) => (
          <div className={`exploration-map-node-output is-${output.kind}`} key={output.handleId}>
            <span>{output.label}</span>
            <Handle
              className="exploration-map-handle exploration-map-output-handle"
              id={output.handleId}
              position={Position.Right}
              type="source"
            />
          </div>
        ))}
      </div>
      <Link className="nodrag exploration-map-node-edit" href={data.editHref as never}>
        Edit <ExternalLink size={13} />
      </Link>
      <Handle className="exploration-map-handle" id="continue" type="source" position={Position.Bottom} />
    </article>
  );
}

const nodeTypes = { explorationPage: PageNode };

function QuizOutcomeBuilder({
  disabled,
  onCreate,
  pages,
  quiz
}: {
  disabled: boolean;
  onCreate: (kind: "CORRECT" | "INCORRECT" | "COMBINATION", optionIds: number[], targetPageId: number) => void;
  pages: ExplorationMapPage[];
  quiz: ExplorationMapQuiz;
}) {
  const supportsExactSelection = quiz.options.length > 0 && ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"].includes(quiz.quizType ?? "");
  const availableKinds = [
    ...(!quiz.outcomes.some((outcome) => outcome.kind === "CORRECT") ? [{ label: "Correct answer", value: "CORRECT" as const }] : []),
    ...(!quiz.outcomes.some((outcome) => outcome.kind === "INCORRECT") ? [{ label: "Incorrect answer", value: "INCORRECT" as const }] : []),
    ...(supportsExactSelection ? [{ label: "Exact selection", value: "COMBINATION" as const }] : [])
  ];
  const [kind, setKind] = useState<"CORRECT" | "INCORRECT" | "COMBINATION">(availableKinds[0]?.value ?? "CORRECT");
  const [optionIds, setOptionIds] = useState<number[]>([]);
  const [targetPageId, setTargetPageId] = useState("");

  useEffect(() => {
    if (!availableKinds.some((candidate) => candidate.value === kind)) setKind(availableKinds[0]?.value ?? "CORRECT");
  }, [availableKinds, kind]);

  return (
    <div className="exploration-map-new-quiz-route">
      <select aria-label={`Result type for ${quiz.title}`} disabled={disabled} onChange={(event) => setKind(event.target.value as typeof kind)} value={kind}>
        {availableKinds.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
      </select>
      {kind === "COMBINATION" && (
        <fieldset>
          <legend>Answers selected together</legend>
          {quiz.options.map((option) => (
            <label className="checkbox-field" key={option.id}>
              <input
                checked={optionIds.includes(option.id)}
                disabled={disabled}
                onChange={(event) => setOptionIds((items) => event.target.checked
                  ? [...items, option.id]
                  : items.filter((optionId) => optionId !== option.id))}
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          ))}
          {quiz.options.length === 0 && <p className="muted">No answer options yet. An empty selection can still be routed.</p>}
        </fieldset>
      )}
      <select aria-label={`Destination for new route in ${quiz.title}`} disabled={disabled} onChange={(event) => setTargetPageId(event.target.value)} value={targetPageId}>
        <option value="">Destination</option>
        {pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
      </select>
      <button
        className="secondary"
        disabled={disabled || !targetPageId}
        onClick={() => {
          onCreate(kind, kind === "COMBINATION" ? optionIds : [], Number(targetPageId));
          setOptionIds([]);
          setTargetPageId("");
        }}
        type="button"
      >
        <Plus size={15} /> Add route
      </button>
    </div>
  );
}

function pageNodes(pages: ExplorationMapPage[], slug: string): PageFlowNode[] {
  const reachablePageIds = reachableExplorationPageIds(pages.map((page) => ({
    id: page.id,
    isStart: page.isStart,
    targetPageIds: [
      page.continueToPageId,
      ...page.choices.map((choice) => choice.toPageId),
      ...page.quizzes.flatMap((quiz) => quiz.outcomes.map((outcome) => outcome.toPageId))
    ]
  })));
  return pages.map((page, index) => ({
    id: String(page.id),
    type: "explorationPage",
    position: page.canvasX === null || page.canvasY === null
      ? fallbackPosition(index)
      : { x: page.canvasX, y: page.canvasY },
    data: {
      editHref: `/explorations/${slug}/edit?view=page&page=${page.id}`,
      isStart: page.isStart,
      outputs: [
        ...page.choices.map((choice) => ({ handleId: `choice-${choice.id}`, kind: "choice" as const, label: choice.label })),
        ...page.quizzes.flatMap((quiz) => quiz.outcomes.map((outcome) => ({
          handleId: `quiz-${outcome.id}`,
          kind: "quiz" as const,
          label: `${quiz.title}: ${outcome.label}`
        })))
      ],
      position: page.position,
      terminal: !pageHasOutgoingLink(page),
      title: page.title,
      unreachable: !reachablePageIds.has(page.id)
    }
  }));
}

function pageEdges(pages: ExplorationMapPage[], selectedEdgeId: string | null, tracedEdgeIds: Set<string>): Edge<LinkData>[] {
  return pages.flatMap((page) => {
    const edges: Edge<LinkData>[] = [];
    if (page.continueToPageId !== null) {
      const id = `continue-${page.id}`;
      edges.push({
        id,
        source: String(page.id),
        sourceHandle: "continue",
        target: String(page.continueToPageId),
        label: "Continue",
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: selectedEdgeId === id,
        className: tracedEdgeIds.has(id) ? "exploration-map-edge is-continue is-traced" : "exploration-map-edge is-continue",
        data: { kind: "continue", pageId: page.id }
      });
    }
    for (const choice of page.choices) {
      if (choice.toPageId === null) continue;
      const id = `choice-${choice.id}`;
      edges.push({
        id,
        source: String(page.id),
        sourceHandle: `choice-${choice.id}`,
        target: String(choice.toPageId),
        label: choice.label,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: selectedEdgeId === id,
        className: tracedEdgeIds.has(id) ? "exploration-map-edge is-choice is-traced" : "exploration-map-edge is-choice",
        data: { kind: "choice", optionId: choice.id, pageId: page.id }
      });
    }
    for (const quiz of page.quizzes) {
      for (const outcome of quiz.outcomes) {
        if (outcome.toPageId === null) continue;
        const id = `quiz-${outcome.id}`;
        edges.push({
          id,
          source: String(page.id),
          sourceHandle: id,
          target: String(outcome.toPageId),
          label: `${quiz.title}: ${outcome.label}`,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed },
          selected: selectedEdgeId === id,
          className: tracedEdgeIds.has(id) ? "exploration-map-edge is-quiz is-traced" : "exploration-map-edge is-quiz",
          data: { kind: "quiz", outcomeId: outcome.id, pageId: page.id }
        });
      }
    }
    return edges;
  });
}

export function ExplorationMapCanvas({
  explorationId,
  explorationSlug,
  initialPages
}: {
  explorationId: number;
  explorationSlug: string;
  initialPages: ExplorationMapPage[];
}) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [nodes, setNodes, onNodesChange] = useNodesState<PageFlowNode>(pageNodes(initialPages, explorationSlug));
  const [selectedPageId, setSelectedPageId] = useState<number | null>(initialPages.find((page) => page.isStart)?.id ?? initialPages[0]?.id ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPathLabel, setNewPathLabel] = useState("");
  const [newPathTarget, setNewPathTarget] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [traceMode, setTraceMode] = useState(false);
  const [tracePageId, setTracePageId] = useState<number | null>(null);
  const [tracedEdgeIds, setTracedEdgeIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPages(initialPages);
    setNodes(pageNodes(initialPages, explorationSlug));
  }, [explorationSlug, initialPages, setNodes]);

  useEffect(() => {
    setNodes((items) => {
      const existingById = new Map(items.map((node) => [node.id, node]));
      return pageNodes(pages, explorationSlug).map((nextNode) => {
        const existing = existingById.get(nextNode.id);
        return existing
          ? { ...nextNode, position: existing.position, selected: existing.selected }
          : nextNode;
      });
    });
  }, [explorationSlug, pages, setNodes]);

  const edges = useMemo(() => pageEdges(pages, selectedEdgeId, tracedEdgeIds), [pages, selectedEdgeId, tracedEdgeIds]);
  const reachablePageIds = useMemo(() => reachableExplorationPageIds(pages.map((page) => ({
    id: page.id,
    isStart: page.isStart,
    targetPageIds: [
      page.continueToPageId,
      ...page.choices.map((choice) => choice.toPageId),
      ...page.quizzes.flatMap((quiz) => quiz.outcomes.map((outcome) => outcome.toPageId))
    ]
  }))), [pages]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const tracePage = pages.find((page) => page.id === tracePageId) ?? null;
  const traceRoutes = tracePage ? [
    ...(tracePage.continueToPageId !== null ? [{ edgeId: `continue-${tracePage.id}`, label: "Continue", targetPageId: tracePage.continueToPageId }] : []),
    ...tracePage.choices.flatMap((choice) => choice.toPageId !== null
      ? [{ edgeId: `choice-${choice.id}`, label: choice.label, targetPageId: choice.toPageId }]
      : []),
    ...tracePage.quizzes.flatMap((quiz) => quiz.outcomes.flatMap((outcome) => outcome.toPageId !== null
      ? [{ edgeId: `quiz-${outcome.id}`, label: `${quiz.title}: ${outcome.label}`, targetPageId: outcome.toPageId }]
      : []))
  ] : [];
  const availableTargets = pages;

  function startTrace() {
    const startPage = pages.find((page) => page.isStart) ?? pages[0];
    if (!startPage) return;
    setTraceMode(true);
    setTracePageId(startPage.id);
    setSelectedPageId(startPage.id);
    setSelectedEdgeId(null);
    setTracedEdgeIds(new Set());
  }

  function stopTrace() {
    setTraceMode(false);
    setTracePageId(null);
    setTracedEdgeIds(new Set());
  }

  function followTrace(edgeId: string, targetPageId: number) {
    setTracedEdgeIds((items) => new Set(items).add(edgeId));
    setSelectedEdgeId(edgeId);
    setTracePageId(targetPageId);
    setSelectedPageId(targetPageId);
    setNodes((items) => items.map((node) => ({ ...node, selected: Number(node.id) === targetPageId })));
  }

  const requestSelectedDeletion = useCallback(() => {
    if (selectedEdgeId) {
      const edge = edges.find((candidate) => candidate.id === selectedEdgeId);
      if (!edge?.data) return;
      const data = edge.data;
      const sourceTitle = pages.find((page) => page.id === data.pageId)?.title ?? "this page";
      const targetTitle = pages.find((page) => page.id === Number(edge.target))?.title ?? "the destination page";
      if (data.kind === "continue") {
        setDeleteTarget({
          kind: "continue",
          pageId: data.pageId,
          sourceTitle,
          targetTitle
        });
        return;
      }
      if (data.kind === "choice") {
        const choice = pages.flatMap((page) => page.choices).find((item) => item.id === data.optionId);
        setDeleteTarget({
          kind: "choice",
          label: choice?.label ?? "this path",
          optionId: data.optionId,
          pageId: data.pageId,
          sourceTitle,
          targetTitle
        });
        return;
      }
      const outcome = pages
        .flatMap((page) => page.quizzes)
        .flatMap((quiz) => quiz.outcomes)
        .find((item) => item.id === data.outcomeId);
      setDeleteTarget({
        kind: "quiz",
        label: outcome?.label ?? "this quiz route",
        outcomeId: data.outcomeId,
        pageId: data.pageId,
        sourceTitle,
        targetTitle
      });
      return;
    }
    const page = pages.find((candidate) => candidate.id === selectedPageId);
    if (!page) return;
    if (pages.length <= 1) {
      setError("An exploration must keep at least one page.");
      return;
    }
    setDeleteTarget({ kind: "page", pageId: page.id, title: page.title });
  }, [edges, pages, selectedEdgeId, selectedPageId]);

  useEffect(() => {
    function handleDeleteKey(event: KeyboardEvent) {
      if (event.key === "Escape" && deleteTarget && !isPending) {
        event.preventDefault();
        setDeleteTarget(null);
        return;
      }
      if (event.key !== "Delete" || deleteTarget || isPending) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!selectedEdgeId && selectedPageId === null) return;
      event.preventDefault();
      requestSelectedDeletion();
    }
    window.addEventListener("keydown", handleDeleteKey, true);
    return () => window.removeEventListener("keydown", handleDeleteKey, true);
  }, [deleteTarget, isPending, requestSelectedDeletion, selectedEdgeId, selectedPageId]);

  const changeContinue = useCallback((pageId: number, targetPageId: number | null) => {
    const previous = pages.find((page) => page.id === pageId)?.continueToPageId ?? null;
    setPages((items) => items.map((page) => page.id === pageId ? { ...page, continueToPageId: targetPageId } : page));
    setError("");
    startTransition(async () => {
      try {
        await setExplorationContinueAction(pageId, targetPageId);
      } catch (reason) {
        setPages((items) => items.map((page) => page.id === pageId ? { ...page, continueToPageId: previous } : page));
        setError(reason instanceof Error ? reason.message : "The link could not be saved.");
      }
    });
  }, [pages]);

  function connectPages(connection: Connection) {
    const pageId = Number(connection.source);
    const targetPageId = Number(connection.target);
    if (!Number.isInteger(pageId) || !Number.isInteger(targetPageId)) return;
    setSelectedPageId(pageId);
    if (connection.sourceHandle?.startsWith("choice-")) {
      const optionId = Number(connection.sourceHandle.slice("choice-".length));
      const choice = pages.flatMap((page) => page.choices).find((item) => item.id === optionId);
      if (!choice) return;
      setSelectedEdgeId(`choice-${optionId}`);
      updatePath(optionId, choice.label, targetPageId);
      return;
    }
    if (connection.sourceHandle?.startsWith("quiz-")) {
      const outcomeId = Number(connection.sourceHandle.slice("quiz-".length));
      const outcome = pages.flatMap((page) => page.quizzes).flatMap((quiz) => quiz.outcomes).find((item) => item.id === outcomeId);
      if (!outcome) return;
      setSelectedEdgeId(`quiz-${outcomeId}`);
      updateQuizOutcome(outcomeId, outcome.label, targetPageId);
      return;
    }
    setSelectedEdgeId(`continue-${pageId}`);
    changeContinue(pageId, targetPageId);
  }

  function movePage(node: PageFlowNode) {
    const pageId = Number(node.id);
    const previous = pages.find((page) => page.id === pageId);
    if (!previous) return;
    setPages((items) => items.map((page) => page.id === pageId
      ? { ...page, canvasX: node.position.x, canvasY: node.position.y }
      : page));
    startTransition(async () => {
      try {
        await updateExplorationCanvasPositionsAction(explorationId, [{ pageId, x: node.position.x, y: node.position.y }]);
      } catch (reason) {
        setNodes((items) => items.map((item) => item.id === node.id
          ? { ...item, position: { x: previous.canvasX ?? 0, y: previous.canvasY ?? 0 } }
          : item));
        setError(reason instanceof Error ? reason.message : "The page position could not be saved.");
      }
    });
  }

  function arrangePages() {
    const positions = pages.map((page, index) => ({ pageId: page.id, ...fallbackPosition(index) }));
    setPages((items) => items.map((page) => {
      const position = positions.find((candidate) => candidate.pageId === page.id)!;
      return { ...page, canvasX: position.x, canvasY: position.y };
    }));
    setNodes((items) => items.map((node) => {
      const position = positions.find((candidate) => candidate.pageId === Number(node.id))!;
      return { ...node, position: { x: position.x, y: position.y } };
    }));
    startTransition(async () => {
      try {
        await updateExplorationCanvasPositionsAction(explorationId, positions);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The map could not be arranged.");
        router.refresh();
      }
    });
  }

  function createPage() {
    const title = newPageTitle.trim();
    if (!title) return;
    setError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("title", title);
        const page = await createExplorationPageAction(explorationId, formData);
        setPages((items) => [...items, {
          id: page.pageId,
          slug: page.slug,
          title: page.title,
          position: page.position,
          isStart: page.isStart,
          canvasX: page.canvasX,
          canvasY: page.canvasY,
          continueToPageId: null,
          blockCount: 0,
          choices: [],
          quizzes: [],
          warnings: []
        }]);
        setSelectedPageId(page.pageId);
        setNewPageTitle("");
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The page could not be created.");
      }
    });
  }

  function createPath() {
    if (!selectedPage || !newPathLabel.trim() || !newPathTarget) return;
    const targetPageId = Number(newPathTarget);
    startTransition(async () => {
      try {
        const result = await createExplorationCanvasChoiceAction(selectedPage.id, targetPageId, newPathLabel);
        setPages((items) => items.map((page) => page.id === selectedPage.id
          ? {
              ...page,
              blockCount: result.blockCreated ? page.blockCount + 1 : page.blockCount,
              choices: [...page.choices, {
                id: result.optionId,
                blockId: result.blockId,
                label: result.label,
                position: page.choices.length + 1,
                toPageId: result.targetPageId
              }]
            }
          : page));
        setNewPathLabel("");
        setNewPathTarget("");
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The path could not be created.");
      }
    });
  }

  function updatePath(optionId: number, label: string, targetPageId: number | null) {
    const previous = pages.flatMap((page) => page.choices).find((choice) => choice.id === optionId);
    if (!previous || !label.trim()) return;
    setPages((items) => items.map((page) => ({
      ...page,
      choices: page.choices.map((choice) => choice.id === optionId ? { ...choice, label, toPageId: targetPageId } : choice)
    })));
    startTransition(async () => {
      try {
        await updateExplorationCanvasChoiceAction(optionId, label, targetPageId);
      } catch (reason) {
        setPages((items) => items.map((page) => ({
          ...page,
          choices: page.choices.map((choice) => choice.id === optionId ? previous : choice)
        })));
        setError(reason instanceof Error ? reason.message : "The path could not be saved.");
      }
    });
  }

  function updateQuizOutcome(outcomeId: number, label: string, targetPageId: number | null) {
    const previous = pages.flatMap((page) => page.quizzes).flatMap((quiz) => quiz.outcomes).find((outcome) => outcome.id === outcomeId);
    if (!previous || !label.trim()) return;
    setPages((items) => items.map((page) => ({
      ...page,
      quizzes: page.quizzes.map((quiz) => ({
        ...quiz,
        outcomes: quiz.outcomes.map((outcome) => outcome.id === outcomeId ? { ...outcome, label, toPageId: targetPageId } : outcome)
      }))
    })));
    startTransition(async () => {
      try {
        await updateExplorationQuizOutcomeAction(outcomeId, label, targetPageId);
      } catch (reason) {
        setPages((items) => items.map((page) => ({
          ...page,
          quizzes: page.quizzes.map((quiz) => ({
            ...quiz,
            outcomes: quiz.outcomes.map((outcome) => outcome.id === outcomeId ? previous : outcome)
          }))
        })));
        setError(reason instanceof Error ? reason.message : "The quiz route could not be saved.");
      }
    });
  }

  function createQuizOutcome(blockId: number, kind: "CORRECT" | "INCORRECT" | "COMBINATION", optionIds: number[], targetPageId: number | null) {
    setError("");
    startTransition(async () => {
      try {
        const outcome = await createExplorationQuizOutcomeAction(blockId, kind, optionIds, targetPageId);
        setPages((items) => items.map((page) => ({
          ...page,
          quizzes: page.quizzes.map((quiz) => quiz.blockId === blockId
            ? { ...quiz, outcomes: [...quiz.outcomes, outcome] }
            : quiz)
        })));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The quiz route could not be created.");
      }
    });
  }

  function confirmDeletion() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setError("");
    startTransition(async () => {
      try {
        if (target.kind === "page") {
          const result = await deleteExplorationCanvasPageAction(target.pageId);
          setPages((items) => items
            .filter((page) => page.id !== result.deletedPageId)
            .map((page) => ({
              ...page,
              continueToPageId: page.continueToPageId === result.deletedPageId ? null : page.continueToPageId,
              isStart: result.newStartPageId === page.id ? true : page.isStart,
              choices: page.choices.map((choice) => choice.toPageId === result.deletedPageId
                ? { ...choice, toPageId: null }
                : choice),
              quizzes: page.quizzes.map((quiz) => ({
                ...quiz,
                outcomes: quiz.outcomes.map((outcome) => outcome.toPageId === result.deletedPageId
                  ? { ...outcome, toPageId: null }
                  : outcome)
              }))
            })));
          setSelectedPageId(result.replacementPageId);
        } else if (target.kind === "quizOutcome") {
          await deleteExplorationQuizOutcomeAction(target.outcomeId);
          setPages((items) => items.map((page) => ({
            ...page,
            quizzes: page.quizzes.map((quiz) => ({
              ...quiz,
              outcomes: quiz.outcomes.filter((outcome) => outcome.id !== target.outcomeId)
            }))
          })));
        } else if (target.kind === "continue") {
          await setExplorationContinueAction(target.pageId, null);
          setPages((items) => items.map((page) => page.id === target.pageId
            ? { ...page, continueToPageId: null }
            : page));
        } else if (target.kind === "choice") {
          await updateExplorationCanvasChoiceAction(target.optionId, target.label, null);
          setPages((items) => items.map((page) => ({
            ...page,
            choices: page.choices.map((choice) => choice.id === target.optionId
              ? { ...choice, toPageId: null }
              : choice)
          })));
        } else {
          await updateExplorationQuizOutcomeAction(target.outcomeId, target.label, null);
          setPages((items) => items.map((page) => ({
            ...page,
            quizzes: page.quizzes.map((quiz) => ({
              ...quiz,
              outcomes: quiz.outcomes.map((outcome) => outcome.id === target.outcomeId
                ? { ...outcome, toPageId: null }
                : outcome)
            }))
          })));
        }
        setSelectedEdgeId(null);
        setDeleteTarget(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The item could not be deleted.");
      }
    });
  }

  return (
    <section className="exploration-map-workspace" aria-busy={isPending}>
      <div className="exploration-map-shell">
        <div className="exploration-map-canvas">
          <ReactFlow<PageFlowNode, Edge<LinkData>>
            colorMode="light"
            deleteKeyCode={null}
            edges={edges}
            fitView
            fitViewOptions={{ minZoom: 0.62, maxZoom: 1.1, padding: 0.2 }}
            minZoom={0.25}
            nodes={nodes}
            nodeTypes={nodeTypes}
            onConnect={connectPages}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedPageId(edge.data?.pageId ?? null);
            }}
            onNodeClick={(_, node) => {
              setSelectedPageId(Number(node.id));
              if (traceMode) setTracePageId(Number(node.id));
              setSelectedEdgeId(null);
            }}
            onNodeDoubleClick={(_, node) => router.push(`/explorations/${explorationSlug}/edit?view=page&page=${node.id}` as never)}
            onNodeDragStop={(_, node) => movePage(node)}
            onNodesChange={onNodesChange}
            onPaneClick={() => {
              setSelectedPageId(null);
              setSelectedEdgeId(null);
            }}
            proOptions={{ hideAttribution: true }}
            snapGrid={[20, 20]}
            snapToGrid
          >
            <Panel className="exploration-map-create-panel" position="top-left">
              <form className="nodrag nopan" onSubmit={(event) => { event.preventDefault(); createPage(); }}>
                <input
                  aria-label="New page title"
                  onChange={(event) => setNewPageTitle(event.target.value)}
                  placeholder="New page title"
                  value={newPageTitle}
                />
                <button disabled={!newPageTitle.trim() || isPending} title="Add page" type="submit">
                  <Plus size={16} /> <span>Add page</span>
                </button>
              </form>
            </Panel>
            <Panel className="exploration-map-arrange-panel" position="top-right">
              <div className="exploration-map-panel-actions">
                <button className={traceMode ? "nodrag nopan is-active" : "secondary nodrag nopan"} disabled={isPending || pages.length === 0} onClick={traceMode ? stopTrace : startTrace} title={traceMode ? "Stop path preview" : "Preview a path"} type="button">
                  {traceMode ? <Square size={15} /> : <Play size={15} />} <span>{traceMode ? "Stop" : "Preview path"}</span>
                </button>
                <button className="secondary nodrag nopan" disabled={isPending || pages.length === 0 || traceMode} onClick={arrangePages} title="Arrange pages" type="button">
                  <LayoutGrid size={16} /> <span>Arrange</span>
                </button>
              </div>
            </Panel>
            <Background color="#c8d3ca" gap={20} size={1} variant={BackgroundVariant.Dots} />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              maskColor="rgb(237 243 238 / 0.76)"
              nodeColor={(node) => node.data.isStart ? "#2b744d" : node.data.terminal ? "#758178" : "#a8b8aa"}
              pannable
              position="bottom-right"
              zoomable
            />
          </ReactFlow>
        </div>

        <aside className="exploration-map-inspector">
          {selectedPage ? (
            <>
              <div className="exploration-map-inspector-heading">
                <div><span>Page {selectedPage.position}</span><h2>{selectedPage.title}</h2></div>
                <Link href={`/explorations/${explorationSlug}/edit?view=page&page=${selectedPage.id}` as never} className="icon-button secondary" title="Edit page"><ExternalLink size={16} /></Link>
              </div>

              {(!reachablePageIds.has(selectedPage.id) || selectedPage.warnings.length > 0) && (
                <div className="exploration-map-warnings" role="status">
                  {!reachablePageIds.has(selectedPage.id) && <p><AlertTriangle size={14} /> This page cannot be reached from the starting page.</p>}
                  {selectedPage.warnings.map((warning) => <p key={warning}><AlertTriangle size={14} /> {warning}</p>)}
                </div>
              )}

              {traceMode && tracePage?.id === selectedPage.id && (
                <section className="exploration-map-trace">
                  <div className="exploration-map-trace-heading">
                    <strong><Play size={14} /> Path preview</strong>
                    <button className="icon-button secondary" onClick={startTrace} title="Restart from the beginning" type="button"><RotateCcw size={14} /></button>
                  </div>
                  <div className="exploration-map-trace-routes">
                    {traceRoutes.map((route) => (
                      <button className="secondary" key={route.edgeId} onClick={() => followTrace(route.edgeId, route.targetPageId)} type="button">
                        {route.label}
                      </button>
                    ))}
                    {traceRoutes.length === 0 && <p><CircleCheck size={15} /> End of this path</p>}
                  </div>
                </section>
              )}

              <section>
                <label><span><Link2 size={14} /> Continue to</span>
                  <select
                    onChange={(event) => changeContinue(selectedPage.id, event.target.value ? Number(event.target.value) : null)}
                    value={selectedPage.continueToPageId ?? ""}
                  >
                    <option value="">End here</option>
                    {availableTargets.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
                  </select>
                </label>
              </section>

              <section>
                <div className="exploration-map-inspector-section-title"><GitBranch size={15} /><strong>Paths</strong></div>
                <div className="exploration-map-path-list">
                  {selectedPage.choices.map((choice) => (
                    <div className={selectedEdgeId === `choice-${choice.id}` ? "exploration-map-path is-selected" : "exploration-map-path"} key={choice.id}>
                      <input
                        aria-label="Path label"
                        defaultValue={choice.label}
                        key={`${choice.id}-${choice.label}`}
                        onBlur={(event) => updatePath(choice.id, event.target.value, choice.toPageId)}
                      />
                      <select
                        aria-label={`Destination for ${choice.label}`}
                        onChange={(event) => updatePath(choice.id, choice.label, event.target.value ? Number(event.target.value) : null)}
                        value={choice.toPageId ?? ""}
                      >
                        <option value="">No destination</option>
                        {availableTargets.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
                      </select>
                      {choice.toPageId !== null && (
                        <button className="icon-button secondary" onClick={() => updatePath(choice.id, choice.label, null)} title="Disconnect path" type="button"><Unlink size={15} /></button>
                      )}
                    </div>
                  ))}
                  {selectedPage.choices.length === 0 && <p className="muted">No named paths.</p>}
                </div>

                <div className="exploration-map-new-path">
                  <input aria-label="New path label" onChange={(event) => setNewPathLabel(event.target.value)} placeholder="Path label" value={newPathLabel} />
                  <select aria-label="New path destination" onChange={(event) => setNewPathTarget(event.target.value)} value={newPathTarget}>
                    <option value="">Destination</option>
                    {availableTargets.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
                  </select>
                  <button disabled={!newPathLabel.trim() || !newPathTarget || isPending} onClick={createPath} type="button"><Plus size={15} /> Add path</button>
                </div>
              </section>

              {selectedPage.quizzes.length > 0 && (
                <section className="exploration-map-quiz-section">
                  <div className="exploration-map-inspector-section-title"><GitBranch size={15} /><strong>Quiz routes</strong></div>
                  {selectedPage.quizzes.map((quiz) => (
                    <details className="exploration-map-quiz" key={quiz.blockId} open>
                      <summary>
                        <span>{quiz.title}</span>
                        <small>Block {quiz.blockPosition}</small>
                      </summary>
                      <div className="exploration-map-quiz-body">
                        <div className="exploration-map-path-list">
                          {quiz.outcomes.map((outcome) => {
                            const matchedAnswers = outcome.optionIds.length
                              ? quiz.options.filter((option) => outcome.optionIds.includes(option.id)).map((option) => option.label).join(", ")
                              : outcome.kind === "COMBINATION" ? "No answer selected" : "";
                            return (
                              <div className={selectedEdgeId === `quiz-${outcome.id}` ? "exploration-map-path exploration-map-quiz-route is-selected" : "exploration-map-path exploration-map-quiz-route"} key={outcome.id}>
                                <span className={`exploration-map-route-kind is-${outcome.kind.toLocaleLowerCase()}`}>{outcome.kind.toLocaleLowerCase()}</span>
                                <input
                                  aria-label="Quiz route label"
                                  defaultValue={outcome.label}
                                  key={`${outcome.id}-${outcome.label}`}
                                  onBlur={(event) => updateQuizOutcome(outcome.id, event.target.value, outcome.toPageId)}
                                />
                                {matchedAnswers && <small>{matchedAnswers}</small>}
                                <select
                                  aria-label={`Destination for ${outcome.label}`}
                                  onChange={(event) => updateQuizOutcome(outcome.id, outcome.label, event.target.value ? Number(event.target.value) : null)}
                                  value={outcome.toPageId ?? ""}
                                >
                                  <option value="">No destination</option>
                                  {availableTargets.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
                                </select>
                                <div className="exploration-map-route-actions">
                                  {outcome.toPageId !== null && (
                                    <button className="icon-button secondary" onClick={() => updateQuizOutcome(outcome.id, outcome.label, null)} title="Disconnect quiz route" type="button"><Unlink size={15} /></button>
                                  )}
                                  <button className="icon-button danger" onClick={() => setDeleteTarget({ kind: "quizOutcome", label: outcome.label, outcomeId: outcome.id })} title="Delete quiz route" type="button"><Trash2 size={15} /></button>
                                </div>
                              </div>
                            );
                          })}
                          {quiz.outcomes.length === 0 && <p className="muted">No quiz routes yet.</p>}
                        </div>
                        <QuizOutcomeBuilder
                          disabled={isPending}
                          onCreate={(kind, optionIds, targetPageId) => createQuizOutcome(quiz.blockId, kind, optionIds, targetPageId)}
                          pages={availableTargets}
                          quiz={quiz}
                        />
                      </div>
                    </details>
                  ))}
                </section>
              )}
            </>
          ) : (
            <div className="exploration-map-inspector-empty"><GitBranch size={22} /><p>Select a page or a link.</p></div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </aside>
      </div>

      {deleteTarget && (
        <div
          className="exploration-map-delete-backdrop"
          onMouseDown={() => { if (!isPending) setDeleteTarget(null); }}
          role="presentation"
        >
          <div
            aria-labelledby="exploration-map-delete-title"
            aria-modal="true"
            className="exploration-map-delete-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="exploration-map-delete-icon"><AlertTriangle aria-hidden="true" size={22} /></div>
            <div>
              <h2 id="exploration-map-delete-title">
                {deleteTarget.kind === "page"
                  ? "Delete this page?"
                  : deleteTarget.kind === "quizOutcome"
                    ? "Delete this quiz route?"
                    : "Delete this link?"}
              </h2>
              {deleteTarget.kind === "page" ? (
                <p>
                  "{deleteTarget.title}", all of its blocks and its outgoing links will be deleted.
                  Links from other pages to it will be disconnected. This cannot be undone.
                </p>
              ) : deleteTarget.kind === "quizOutcome" ? (
                <p>The "{deleteTarget.label}" result and its link will be deleted. The quiz answers themselves will not change.</p>
              ) : deleteTarget.kind === "continue" ? (
                <p>
                  The Continue link from "{deleteTarget.sourceTitle}" to "{deleteTarget.targetTitle}" will be removed.
                </p>
              ) : deleteTarget.kind === "choice" ? (
                <p>
                  The "{deleteTarget.label}" link from "{deleteTarget.sourceTitle}" to "{deleteTarget.targetTitle}" will be disconnected.
                  The choice itself will remain available for editing.
                </p>
              ) : (
                <p>
                  The "{deleteTarget.label}" quiz link from "{deleteTarget.sourceTitle}" to "{deleteTarget.targetTitle}" will be disconnected.
                  The quiz result itself will remain available for editing.
                </p>
              )}
            </div>
            <div className="exploration-map-delete-actions">
              <button autoFocus className="secondary" disabled={isPending} onClick={() => setDeleteTarget(null)} type="button">Cancel</button>
              <button className="danger" disabled={isPending} onClick={confirmDeletion} type="button">
                <Trash2 size={16} /> {isPending
                  ? "Deleting..."
                  : deleteTarget.kind === "page"
                    ? "Delete page"
                    : deleteTarget.kind === "quizOutcome"
                      ? "Delete route"
                      : "Delete link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
