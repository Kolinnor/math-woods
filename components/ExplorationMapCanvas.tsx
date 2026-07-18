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
  Position,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps
} from "@xyflow/react";
import { ExternalLink, Flag, GitBranch, LayoutGrid, Link2, Plus, Unlink } from "lucide-react";
import {
  createExplorationCanvasChoiceAction,
  createExplorationPageAction,
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
  blockCount: number;
  choiceCount: number;
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
        {data.terminal && <strong className="is-terminal">End</strong>}
      </div>
      <h3>{data.title}</h3>
      <div className="exploration-map-node-meta">
        <span>{data.blockCount} {data.blockCount === 1 ? "block" : "blocks"}</span>
        <span>{data.choiceCount} {data.choiceCount === 1 ? "path" : "paths"}</span>
      </div>
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
      blockCount: page.blockCount,
      choiceCount: page.choices.length,
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

  return (
    <section className="exploration-map-workspace" aria-busy={isPending}>
      <div className="exploration-map-toolbar">
        <form onSubmit={(event) => { event.preventDefault(); createPage(); }}>
          <input
            aria-label="New page title"
            onChange={(event) => setNewPageTitle(event.target.value)}
            placeholder="New page title"
            value={newPageTitle}
          />
          <button disabled={!newPageTitle.trim() || isPending} type="submit"><Plus size={16} /> Add page</button>
        </form>
        <button className="secondary" disabled={isPending || pages.length === 0} onClick={arrangePages} type="button">
          <LayoutGrid size={16} /> Arrange
        </button>
      </div>

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
    </section>
  );
}
