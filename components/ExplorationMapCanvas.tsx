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
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams
} from "@xyflow/react";
import { ExternalLink, Flag, Signpost, Trash2 } from "lucide-react";
import { ExplorationAddContentForm } from "@/components/ExplorationAddContentForm";
import {
  deleteExplorationBlockAction,
  setExplorationBlockContinueAction,
  setExplorationBlockEndpointAction,
  setExplorationChoiceBlockTargetAction,
  setExplorationQuizOutcomeBlockTargetAction,
  updateExplorationBlockCanvasPositionsAction,
  updateExplorationBlockNameAction
} from "@/lib/actions/exploration-actions";

export type ExplorationMapBlock = {
  id: number;
  key: string;
  kind: string;
  name: string | null;
  fallbackLabel: string;
  label: string;
  excerpt: string;
  canvasX: number | null;
  canvasY: number | null;
  isStart: boolean;
  isEnd: boolean;
  continueToBlockId: number | null;
  options: Array<{ id: number; label: string; toBlockId: number | null }>;
  outcomes: Array<{ id: number; label: string; toBlockId: number | null }>;
};

type BlockNodeData = {
  block: ExplorationMapBlock;
  editHref: string;
};

type GraphEdgeData = {
  kind: "continue" | "choice" | "quiz";
  recordId: number;
};

function fallbackPosition(index: number) {
  return { x: (index % 4) * 320, y: Math.floor(index / 4) * 220 };
}

function BlockNode({ data, selected }: NodeProps<Node<BlockNodeData>>) {
  const { block, editHref } = data;
  return (
    <article className={selected ? "exploration-block-node is-selected" : "exploration-block-node"}>
      <Handle type="target" position={Position.Top} />
      <div className="exploration-block-node-meta">
        <span>{block.kind.toLocaleLowerCase().replaceAll("_", " ")}</span>
        <span className="exploration-block-node-markers">
          {block.isStart && <span title="Start"><Flag size={13} /> Start</span>}
          {block.isEnd && <span title="End"><Signpost size={13} /> End</span>}
        </span>
      </div>
      <strong>{block.label}</strong>
      {block.excerpt && <p>{block.excerpt}</p>}
      {(block.options.length > 0 || block.outcomes.length > 0) && (
        <div className="exploration-block-node-routes">
          {block.options.map((option) => (
            <div key={option.id}>
              <span>{option.label}</span>
              <Handle id={`choice-${option.id}`} type="source" position={Position.Right} />
            </div>
          ))}
          {block.outcomes.map((outcome) => (
            <div key={outcome.id}>
              <span>{outcome.label}</span>
              <Handle id={`quiz-${outcome.id}`} type="source" position={Position.Right} />
            </div>
          ))}
        </div>
      )}
      <Link className="exploration-block-node-edit nodrag nopan" href={editHref as never}>Edit <ExternalLink size={12} /></Link>
      <Handle id="continue" type="source" position={Position.Bottom} />
    </article>
  );
}

const nodeTypes = { explorationBlock: BlockNode };

function graphNodes(blocks: ExplorationMapBlock[], slug: string): Array<Node<BlockNodeData>> {
  return blocks.map((block, index) => ({
    id: String(block.id),
    type: "explorationBlock",
    position: block.canvasX === null || block.canvasY === null
      ? fallbackPosition(index)
      : { x: block.canvasX, y: block.canvasY },
    data: {
      block,
      editHref: `/explorations/${slug}/edit?view=block&block=${block.id}`
    }
  }));
}

function graphEdges(blocks: ExplorationMapBlock[]): Array<Edge<GraphEdgeData>> {
  const ids = new Set(blocks.map((block) => block.id));
  const edges: Array<Edge<GraphEdgeData>> = [];
  for (const block of blocks) {
    if (block.continueToBlockId && ids.has(block.continueToBlockId)) {
      edges.push({
        id: `continue-${block.id}`,
        source: String(block.id),
        sourceHandle: "continue",
        target: String(block.continueToBlockId),
        label: "Continue",
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { kind: "continue", recordId: block.id }
      });
    }
    for (const option of block.options) {
      if (!option.toBlockId || !ids.has(option.toBlockId)) continue;
      edges.push({
        id: `choice-${option.id}`,
        source: String(block.id),
        sourceHandle: `choice-${option.id}`,
        target: String(option.toBlockId),
        label: option.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { kind: "choice", recordId: option.id }
      });
    }
    for (const outcome of block.outcomes) {
      if (!outcome.toBlockId || !ids.has(outcome.toBlockId)) continue;
      edges.push({
        id: `quiz-${outcome.id}`,
        source: String(block.id),
        sourceHandle: `quiz-${outcome.id}`,
        target: String(outcome.toBlockId),
        label: outcome.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { kind: "quiz", recordId: outcome.id }
      });
    }
  }
  return edges;
}

export function ExplorationMapCanvas({
  explorationId,
  explorationSlug,
  initialBlocks,
  kinds
}: {
  explorationId: number;
  explorationSlug: string;
  initialBlocks: ExplorationMapBlock[];
  kinds: Array<{ label: string; value: string }>;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes(initialBlocks, explorationSlug));
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges(initialBlocks));
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setBlocks(initialBlocks);
    setNodes(graphNodes(initialBlocks, explorationSlug));
    setEdges(graphEdges(initialBlocks));
  }, [explorationSlug, initialBlocks, setEdges, setNodes]);

  const selectedBlock = blocks.find((block) => block.id === selectedNodeId) ?? null;

  const updateBlock = useCallback((blockId: number, update: (block: ExplorationMapBlock) => ExplorationMapBlock) => {
    setBlocks((items) => {
      const next = items.map((block) => block.id === blockId ? update(block) : block);
      setNodes(graphNodes(next, explorationSlug));
      setEdges(graphEdges(next));
      return next;
    });
  }, [explorationSlug, setEdges, setNodes]);

  const connect = useCallback((connection: Connection) => {
    const sourceId = Number(connection.source);
    const targetId = Number(connection.target);
    if (!Number.isInteger(sourceId) || !Number.isInteger(targetId) || sourceId === targetId) return;
    setError("");
    startTransition(async () => {
      try {
        if (connection.sourceHandle === "continue") {
          await setExplorationBlockContinueAction(sourceId, targetId);
          updateBlock(sourceId, (block) => ({ ...block, continueToBlockId: targetId, isEnd: false }));
        } else if (connection.sourceHandle?.startsWith("choice-")) {
          const optionId = Number(connection.sourceHandle.slice(7));
          await setExplorationChoiceBlockTargetAction(optionId, targetId);
          updateBlock(sourceId, (block) => ({
            ...block,
            options: block.options.map((option) => option.id === optionId ? { ...option, toBlockId: targetId } : option)
          }));
        } else if (connection.sourceHandle?.startsWith("quiz-")) {
          const outcomeId = Number(connection.sourceHandle.slice(5));
          await setExplorationQuizOutcomeBlockTargetAction(outcomeId, targetId);
          updateBlock(sourceId, (block) => ({
            ...block,
            outcomes: block.outcomes.map((outcome) => outcome.id === outcomeId ? { ...outcome, toBlockId: targetId } : outcome)
          }));
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The blocks could not be linked.");
      }
    });
  }, [updateBlock]);

  const deleteEdge = useCallback((edge: Edge<GraphEdgeData>) => {
    if (!edge.data || !window.confirm(`Delete the link "${String(edge.label ?? "Path")}"?`)) return;
    setError("");
    startTransition(async () => {
      try {
        if (edge.data!.kind === "continue") {
          await setExplorationBlockContinueAction(edge.data!.recordId, null);
          updateBlock(edge.data!.recordId, (block) => ({ ...block, continueToBlockId: null }));
        } else if (edge.data!.kind === "choice") {
          await setExplorationChoiceBlockTargetAction(edge.data!.recordId, null);
          const sourceId = Number(edge.source);
          updateBlock(sourceId, (block) => ({
            ...block,
            options: block.options.map((option) => option.id === edge.data!.recordId ? { ...option, toBlockId: null } : option)
          }));
        } else {
          await setExplorationQuizOutcomeBlockTargetAction(edge.data!.recordId, null);
          const sourceId = Number(edge.source);
          updateBlock(sourceId, (block) => ({
            ...block,
            outcomes: block.outcomes.map((outcome) => outcome.id === edge.data!.recordId ? { ...outcome, toBlockId: null } : outcome)
          }));
        }
        setSelectedEdgeId(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The link could not be deleted.");
      }
    });
  }, [updateBlock]);

  const deleteBlock = useCallback((blockId: number) => {
    if (!window.confirm("Delete this block? Linked paths will be reconnected when possible.")) return;
    setError("");
    startTransition(async () => {
      try {
        await deleteExplorationBlockAction(blockId);
        const next = blocks.filter((block) => block.id !== blockId).map((block) => ({
          ...block,
          continueToBlockId: block.continueToBlockId === blockId ? null : block.continueToBlockId,
          options: block.options.map((option) => option.toBlockId === blockId ? { ...option, toBlockId: null } : option),
          outcomes: block.outcomes.map((outcome) => outcome.toBlockId === blockId ? { ...outcome, toBlockId: null } : outcome)
        }));
        setBlocks(next);
        setNodes(graphNodes(next, explorationSlug));
        setEdges(graphEdges(next));
        setSelectedNodeId(null);
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The block could not be deleted.");
      }
    });
  }, [blocks, explorationSlug, router, setEdges, setNodes]);

  useEffect(() => {
    function handleDelete(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const edge = edges.find((candidate) => candidate.id === selectedEdgeId);
      if (edge) deleteEdge(edge);
      else if (selectedNodeId) deleteBlock(selectedNodeId);
    }
    window.addEventListener("keydown", handleDelete);
    return () => window.removeEventListener("keydown", handleDelete);
  }, [deleteBlock, deleteEdge, edges, selectedEdgeId, selectedNodeId]);

  function selectionChanged(selection: OnSelectionChangeParams) {
    setSelectedNodeId(selection.nodes[0] ? Number(selection.nodes[0].id) : null);
    setSelectedEdgeId(selection.edges[0]?.id ?? null);
  }

  function setEndpoint(endpoint: "start" | "end") {
    if (!selectedBlock) return;
    startTransition(async () => {
      try {
        await setExplorationBlockEndpointAction(selectedBlock.id, endpoint);
        const next = blocks.map((block) => ({
          ...block,
          ...(endpoint === "start" ? { isStart: block.id === selectedBlock.id } : { isEnd: block.id === selectedBlock.id }),
          ...(endpoint === "end" && block.id === selectedBlock.id ? { continueToBlockId: null } : {})
        }));
        setBlocks(next);
        setNodes(graphNodes(next, explorationSlug));
        setEdges(graphEdges(next));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The endpoint could not be changed.");
      }
    });
  }

  function saveBlockName(blockId: number, rawName: string) {
    const name = rawName.trim();
    const block = blocks.find((candidate) => candidate.id === blockId);
    if (!block || (block.name ?? "") === name) return;
    setError("");
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("name", name);
        await updateExplorationBlockNameAction(blockId, formData);
        updateBlock(blockId, (candidate) => ({
          ...candidate,
          name: name || null,
          label: name || candidate.fallbackLabel
        }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The block name could not be saved.");
      }
    });
  }

  const nodeColor = useMemo(() => (node: Node<BlockNodeData>) => {
    if (node.data.block.isStart) return "#2b744d";
    if (node.data.block.isEnd) return "#7b6a36";
    return "#9aab9d";
  }, []);

  return (
    <div className="exploration-block-map" aria-busy={isPending}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        onSelectionChange={selectionChanged}
        onNodeDragStop={(_, node) => {
          void updateExplorationBlockCanvasPositionsAction(explorationId, [{ blockId: Number(node.id), x: node.position.x, y: node.position.y }]);
        }}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={1.5}
      >
        <Panel className="exploration-block-map-add nodrag nopan" position="top-left">
          <ExplorationAddContentForm explorationId={explorationId} explorationSlug={explorationSlug} kinds={kinds} />
        </Panel>
        {selectedBlock && (
          <Panel className="exploration-block-inspector nodrag nopan" position="top-right">
            <div>
              <span>{selectedBlock.kind.toLocaleLowerCase().replaceAll("_", " ")}</span>
              <input
                key={selectedBlock.id}
                aria-label="Block name"
                defaultValue={selectedBlock.name ?? ""}
                maxLength={160}
                onBlur={(event) => saveBlockName(selectedBlock.id, event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.currentTarget.blur();
                }}
                placeholder="Name"
              />
            </div>
            <Link className="button secondary" href={`/explorations/${explorationSlug}/edit?view=block&block=${selectedBlock.id}` as never}>Edit <ExternalLink size={14} /></Link>
            <button className="secondary" type="button" onClick={() => setEndpoint("start")}><Flag size={15} /> Set as start</button>
            <button className="secondary" type="button" onClick={() => setEndpoint("end")}><Signpost size={15} /> Set as end</button>
            <button className="danger" type="button" onClick={() => deleteBlock(selectedBlock.id)}><Trash2 size={15} /> Delete</button>
          </Panel>
        )}
        {error && <Panel className="exploration-map-error" position="bottom-center">{error}</Panel>}
        <Background color="#c8d3ca" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap nodeColor={nodeColor} maskColor="rgb(237 243 238 / 0.76)" pannable zoomable />
      </ReactFlow>
    </div>
  );
}
