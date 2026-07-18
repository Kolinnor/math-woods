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
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { AlertTriangle, CircleCheck, ExternalLink, Flag, GitBranch, LayoutGrid, Link2, Plus, Trash2, Unlink } from "lucide-react";
import {
  createExplorationCanvasChoiceAction,
  createExplorationPageAction,
  deleteExplorationCanvasPageAction,
  setExplorationContinueAction,
  updateExplorationCanvasChoiceAction,
  updateExplorationCanvasPositionsAction
} from "@/lib/actions/exploration-actions";

export type ExplorationMapChoice = {
  id: number;
  blockId: number;
  label: string;
  position: number;
  toPageId: number | null;
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
};

type PageNodeData = {
  editHref: string;
  isStart: boolean;
  position: number;
  terminal: boolean;
  title: string;
};

type PageFlowNode = Node<PageNodeData, "explorationPage">;
type LinkData =
  | { kind: "continue"; pageId: number }
  | { kind: "choice"; optionId: number; pageId: number };
type DeleteTarget =
  | { kind: "page"; pageId: number; title: string }
  | { kind: "continue"; pageId: number; sourceTitle: string; targetTitle: string }
  | { kind: "choice"; label: string; optionId: number; pageId: number; sourceTitle: string; targetTitle: string };

function fallbackPosition(index: number) {
  return { x: (index % 4) * 320, y: Math.floor(index / 4) * 220 };
}

function pageHasOutgoingLink(page: ExplorationMapPage) {
  return page.continueToPageId !== null || page.choices.some((choice) => choice.toPageId !== null);
}

function PageNode({ data, selected }: NodeProps<PageFlowNode>) {
  return (
    <article className={selected ? "exploration-map-node is-selected" : "exploration-map-node"}>
      <Handle className="exploration-map-handle" type="target" position={Position.Top} />
      <div className="exploration-map-node-heading">
        <span>Page {data.position}</span>
        {data.isStart && <strong><Flag size={12} /> Start</strong>}
        {data.terminal && <strong className="is-terminal"><CircleCheck size={12} /> End</strong>}
      </div>
      <h3>{data.title}</h3>
      <Link className="nodrag exploration-map-node-edit" href={data.editHref as never}>
        Edit <ExternalLink size={13} />
      </Link>
      <Handle className="exploration-map-handle" id="continue" type="source" position={Position.Bottom} />
    </article>
  );
}

const nodeTypes = { explorationPage: PageNode };

function pageNodes(pages: ExplorationMapPage[], slug: string): PageFlowNode[] {
  return pages.map((page, index) => ({
    id: String(page.id),
    type: "explorationPage",
    position: page.canvasX === null || page.canvasY === null
      ? fallbackPosition(index)
      : { x: page.canvasX, y: page.canvasY },
    data: {
      editHref: `/explorations/${slug}/edit?view=page&page=${page.id}`,
      isStart: page.isStart,
      position: page.position,
      terminal: !pageHasOutgoingLink(page),
      title: page.title
    }
  }));
}

function pageEdges(pages: ExplorationMapPage[], selectedEdgeId: string | null): Edge<LinkData>[] {
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
        className: "exploration-map-edge is-continue",
        data: { kind: "continue", pageId: page.id }
      });
    }
    for (const choice of page.choices) {
      if (choice.toPageId === null) continue;
      const id = `choice-${choice.id}`;
      edges.push({
        id,
        source: String(page.id),
        target: String(choice.toPageId),
        label: choice.label,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        selected: selectedEdgeId === id,
        className: "exploration-map-edge is-choice",
        data: { kind: "choice", optionId: choice.id, pageId: page.id }
      });
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

  const edges = useMemo(() => pageEdges(pages, selectedEdgeId), [pages, selectedEdgeId]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? null;
  const availableTargets = pages;

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
          choices: []
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
                : choice)
            })));
          setSelectedPageId(result.replacementPageId);
        } else if (target.kind === "continue") {
          await setExplorationContinueAction(target.pageId, null);
          setPages((items) => items.map((page) => page.id === target.pageId
            ? { ...page, continueToPageId: null }
            : page));
        } else {
          await updateExplorationCanvasChoiceAction(target.optionId, target.label, null);
          setPages((items) => items.map((page) => ({
            ...page,
            choices: page.choices.map((choice) => choice.id === target.optionId
              ? { ...choice, toPageId: null }
              : choice)
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
              <button className="secondary nodrag nopan" disabled={isPending || pages.length === 0} onClick={arrangePages} title="Arrange pages" type="button">
                <LayoutGrid size={16} /> <span>Arrange</span>
              </button>
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
                {deleteTarget.kind === "page" ? "Delete this page?" : "Delete this link?"}
              </h2>
              {deleteTarget.kind === "page" ? (
                <p>
                  "{deleteTarget.title}", all of its blocks and its outgoing links will be deleted.
                  Links from other pages to it will be disconnected. This cannot be undone.
                </p>
              ) : deleteTarget.kind === "continue" ? (
                <p>
                  The Continue link from "{deleteTarget.sourceTitle}" to "{deleteTarget.targetTitle}" will be removed.
                </p>
              ) : (
                <p>
                  The "{deleteTarget.label}" link from "{deleteTarget.sourceTitle}" to "{deleteTarget.targetTitle}" will be disconnected.
                  The choice itself will remain available for editing.
                </p>
              )}
            </div>
            <div className="exploration-map-delete-actions">
              <button autoFocus className="secondary" disabled={isPending} onClick={() => setDeleteTarget(null)} type="button">Cancel</button>
              <button className="danger" disabled={isPending} onClick={confirmDeletion} type="button">
                <Trash2 size={16} /> {isPending ? "Deleting..." : deleteTarget.kind === "page" ? "Delete page" : "Delete link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
