"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
  type ReactFlowInstance
} from "@xyflow/react";
import { ExternalLink, Flag, Redo2, Signpost, Trash2, Undo2 } from "lucide-react";
import { ExplorationAddContentForm } from "@/components/ExplorationAddContentForm";
import { ExplorationBlockNameHelp } from "@/components/ExplorationBlockNameHelp";
import {
  deleteExplorationBlockAction,
  reconnectExplorationMapLinkAction,
  restoreExplorationMapStateAction,
  setExplorationBlockContinueAction,
  setExplorationBlockEndpointAction,
  setExplorationChoiceBlockTargetAction,
  setExplorationQuizOutcomeBlockTargetAction,
  updateExplorationBlockCanvasPositionsAction,
  updateExplorationBlockNameAction,
  type ExplorationMapHistoryBlock,
  type ExplorationMapLinkSource
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
  continueTargetHandle: string | null;
  autoContinue: boolean;
  options: Array<{ id: number; label: string; toBlockId: number | null; targetHandle: string | null }>;
  outcomes: Array<{ id: number; label: string; toBlockId: number | null; targetHandle: string | null }>;
};

type BlockNodeData = {
  block: ExplorationMapBlock;
};

type GraphEdgeData = {
  kind: "continue" | "choice" | "quiz";
  recordId: number;
};

const MAP_HISTORY_LIMIT = 50;
const AUTOMATIC_EDGE_MARKER = "url(#exploration-automatic-edge-marker)";
const EDGE_RECONNECT_RADIUS = 18;
const BLOCK_CENTER_OFFSET = { x: 112, y: 70 };

function mapHistoryState(blocks: ExplorationMapBlock[]): ExplorationMapHistoryBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    canvasX: block.canvasX,
    canvasY: block.canvasY,
    isStart: block.isStart,
    isEnd: block.isEnd,
    continueToBlockId: block.continueToBlockId,
    continueTargetHandle: block.continueTargetHandle,
    autoContinue: block.autoContinue,
    name: block.name,
    options: block.options.map((option) => ({
      id: option.id,
      toBlockId: option.toBlockId,
      targetHandle: option.targetHandle
    })),
    outcomes: block.outcomes.map((outcome) => ({
      id: outcome.id,
      toBlockId: outcome.toBlockId,
      targetHandle: outcome.targetHandle
    }))
  }));
}

function sameBlockStructure(left: ExplorationMapBlock[], right: ExplorationMapBlock[]) {
  if (left.length !== right.length) return false;
  return left.every((block, index) => block.id === right[index]?.id);
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
}

function fallbackPosition(index: number) {
  return { x: (index % 4) * 320, y: Math.floor(index / 4) * 220 };
}

function BlockNode({ data, selected }: NodeProps<Node<BlockNodeData>>) {
  const { block } = data;
  return (
    <article className={selected ? "exploration-block-node is-selected" : "exploration-block-node"}>
      <Handle type="target" position={Position.Top} isConnectableStart={false} />
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
      <Handle id="continue" type="source" position={Position.Bottom} />
    </article>
  );
}

const nodeTypes = { explorationBlock: BlockNode };

function graphNodes(blocks: ExplorationMapBlock[]): Array<Node<BlockNodeData>> {
  return blocks.map((block, index) => ({
    id: String(block.id),
    type: "explorationBlock",
    position: block.canvasX === null || block.canvasY === null
      ? fallbackPosition(index)
      : { x: block.canvasX, y: block.canvasY },
    data: { block }
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
        targetHandle: block.continueTargetHandle,
        reconnectable: true,
        label: block.autoContinue ? "Automatic" : "Continue",
        markerEnd: block.autoContinue ? AUTOMATIC_EDGE_MARKER : { type: MarkerType.ArrowClosed },
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
        targetHandle: option.targetHandle,
        reconnectable: true,
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
        targetHandle: outcome.targetHandle,
        reconnectable: true,
        label: outcome.label,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: { kind: "quiz", recordId: outcome.id }
      });
    }
  }
  return edges;
}

function sameLinkSource(left: ExplorationMapLinkSource, right: ExplorationMapLinkSource) {
  return left.kind === right.kind && left.recordId === right.recordId;
}

function linkSourceForHandle(
  blocks: ExplorationMapBlock[],
  sourceId: number,
  sourceHandle: string | null
): ExplorationMapLinkSource | null {
  const block = blocks.find((item) => item.id === sourceId);
  if (!block || !sourceHandle) return null;
  if (sourceHandle === "continue") return { kind: "continue", recordId: block.id };
  if (sourceHandle.startsWith("choice-")) {
    const recordId = Number(sourceHandle.slice(7));
    return block.options.some((option) => option.id === recordId) ? { kind: "choice", recordId } : null;
  }
  if (sourceHandle.startsWith("quiz-")) {
    const recordId = Number(sourceHandle.slice(5));
    return block.outcomes.some((outcome) => outcome.id === recordId) ? { kind: "quiz", recordId } : null;
  }
  return null;
}

function linkSourceState(blocks: ExplorationMapBlock[], source: ExplorationMapLinkSource) {
  if (source.kind === "continue") {
    const block = blocks.find((item) => item.id === source.recordId);
    return block && { sourceBlockId: block.id, targetBlockId: block.continueToBlockId };
  }
  for (const block of blocks) {
    const route = source.kind === "choice"
      ? block.options.find((option) => option.id === source.recordId)
      : block.outcomes.find((outcome) => outcome.id === source.recordId);
    if (route) return { sourceBlockId: block.id, targetBlockId: route.toBlockId };
  }
  return null;
}

function targetHandleBelongsToBlock(block: ExplorationMapBlock | undefined, targetHandle: string | null) {
  if (!block) return false;
  if (!targetHandle || targetHandle === "continue") return true;
  if (targetHandle.startsWith("choice-")) {
    const optionId = Number(targetHandle.slice(7));
    return block.options.some((option) => option.id === optionId);
  }
  if (targetHandle.startsWith("quiz-")) {
    const outcomeId = Number(targetHandle.slice(5));
    return block.outcomes.some((outcome) => outcome.id === outcomeId);
  }
  return false;
}

function edgeIdForSource(source: ExplorationMapLinkSource) {
  return `${source.kind}-${source.recordId}`;
}

function writeLinkSource(
  blocks: ExplorationMapBlock[],
  source: ExplorationMapLinkSource,
  targetBlockId: number | null,
  targetHandle: string | null
) {
  return blocks.map((block) => {
    if (source.kind === "continue" && block.id === source.recordId) {
      return {
        ...block,
        continueToBlockId: targetBlockId,
        continueTargetHandle: targetBlockId === null ? null : targetHandle,
        autoContinue: targetBlockId === null ? false : block.autoContinue,
        isEnd: targetBlockId === null ? block.isEnd : false
      };
    }
    if (source.kind === "choice" && block.options.some((option) => option.id === source.recordId)) {
      return {
        ...block,
        options: block.options.map((option) => option.id === source.recordId
          ? { ...option, toBlockId: targetBlockId, targetHandle: targetBlockId === null ? null : targetHandle }
          : option)
      };
    }
    if (source.kind === "quiz" && block.outcomes.some((outcome) => outcome.id === source.recordId)) {
      return {
        ...block,
        outcomes: block.outcomes.map((outcome) => outcome.id === source.recordId
          ? { ...outcome, toBlockId: targetBlockId, targetHandle: targetBlockId === null ? null : targetHandle }
          : outcome)
      };
    }
    return block;
  });
}

function reconnectMapBlocks(
  blocks: ExplorationMapBlock[],
  previousSource: ExplorationMapLinkSource,
  nextSource: ExplorationMapLinkSource,
  targetBlockId: number,
  targetHandle: string | null
) {
  const cleared = sameLinkSource(previousSource, nextSource)
    ? blocks
    : writeLinkSource(blocks, previousSource, null, null);
  return writeLinkSource(cleared, nextSource, targetBlockId, targetHandle);
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
  const blocksRef = useRef(initialBlocks);
  const [past, setPast] = useState<ExplorationMapBlock[][]>([]);
  const [future, setFuture] = useState<ExplorationMapBlock[][]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes(initialBlocks));
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges(initialBlocks));
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance<Node<BlockNodeData>, Edge<GraphEdgeData>> | null>(null);
  const reconnectingEdgeRef = useRef<Edge<GraphEdgeData> | null>(null);

  const canvasViewportCenter = useCallback(() => {
    const map = mapRef.current;
    const flow = flowInstanceRef.current;
    if (!map || !flow) return null;
    const bounds = map.getBoundingClientRect();
    const center = flow.screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    });
    return {
      x: center.x - BLOCK_CENTER_OFFSET.x,
      y: center.y - BLOCK_CENTER_OFFSET.y
    };
  }, []);

  const renderBlocks = useCallback((next: ExplorationMapBlock[]) => {
    blocksRef.current = next;
    setBlocks(next);
    setNodes(graphNodes(next));
    setEdges(graphEdges(next));
  }, [setEdges, setNodes]);

  const commitBlocks = useCallback((next: ExplorationMapBlock[], previous = blocksRef.current) => {
    setPast((items) => [...items, previous].slice(-MAP_HISTORY_LIMIT));
    setFuture([]);
    renderBlocks(next);
  }, [renderBlocks]);

  useEffect(() => {
    const structureChanged = !sameBlockStructure(blocksRef.current, initialBlocks);
    renderBlocks(initialBlocks);
    if (structureChanged) {
      setPast([]);
      setFuture([]);
    }
  }, [initialBlocks, renderBlocks]);

  const selectedBlock = blocks.find((block) => block.id === selectedNodeId) ?? null;

  const updateBlock = useCallback((
    blockId: number,
    update: (block: ExplorationMapBlock) => ExplorationMapBlock,
    previous = blocksRef.current
  ) => {
    commitBlocks(previous.map((block) => block.id === blockId ? update(block) : block), previous);
  }, [commitBlocks]);

  const isValidMapConnection = useCallback<IsValidConnection<Edge<GraphEdgeData>>>((connection) => {
    const sourceId = Number(connection.source);
    const targetId = Number(connection.target);
    if (!Number.isInteger(sourceId) || !Number.isInteger(targetId)) return false;
    const source = linkSourceForHandle(blocksRef.current, sourceId, connection.sourceHandle ?? null);
    if (!source || (sourceId === targetId && source.kind !== "choice")) return false;
    const sourceState = linkSourceState(blocksRef.current, source);
    const reconnectingSource = reconnectingEdgeRef.current?.data;
    if (
      sourceState?.targetBlockId !== null &&
      (!reconnectingSource || !sameLinkSource(source, reconnectingSource))
    ) return false;
    return targetHandleBelongsToBlock(
      blocksRef.current.find((block) => block.id === targetId),
      connection.targetHandle ?? null
    );
  }, []);

  const connect = useCallback((connection: Connection) => {
    if (isPending) return;
    const sourceId = Number(connection.source);
    const targetId = Number(connection.target);
    const source = linkSourceForHandle(blocksRef.current, sourceId, connection.sourceHandle);
    if (
      !Number.isInteger(sourceId) ||
      !Number.isInteger(targetId) ||
      !source ||
      (sourceId === targetId && source.kind !== "choice")
    ) return;
    const targetHandle = connection.targetHandle ?? null;
    const previous = blocksRef.current;
    setError("");
    startTransition(async () => {
      try {
        if (source.kind === "continue") {
          await setExplorationBlockContinueAction(source.recordId, targetId, undefined, targetHandle);
        } else if (source.kind === "choice") {
          await setExplorationChoiceBlockTargetAction(source.recordId, targetId, targetHandle);
        } else {
          await setExplorationQuizOutcomeBlockTargetAction(source.recordId, targetId, targetHandle);
        }
        commitBlocks(writeLinkSource(previous, source, targetId, targetHandle), previous);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The blocks could not be linked.");
      }
    });
  }, [commitBlocks, isPending]);

  const reconnect = useCallback((edge: Edge<GraphEdgeData>, connection: Connection) => {
    if (isPending || !edge.data) return;
    const sourceId = Number(connection.source);
    const targetId = Number(connection.target);
    const nextSource = linkSourceForHandle(blocksRef.current, sourceId, connection.sourceHandle);
    if (
      !Number.isInteger(sourceId) ||
      !Number.isInteger(targetId) ||
      !nextSource ||
      (sourceId === targetId && nextSource.kind !== "choice")
    ) return;
    const targetHandle = connection.targetHandle ?? null;
    const previous = blocksRef.current;
    setError("");
    startTransition(async () => {
      try {
        await reconnectExplorationMapLinkAction(edge.data!, nextSource, targetId, targetHandle);
        commitBlocks(reconnectMapBlocks(previous, edge.data!, nextSource, targetId, targetHandle), previous);
        setSelectedEdgeId(edgeIdForSource(nextSource));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The link could not be reconnected.");
      }
    });
  }, [commitBlocks, isPending]);

  const deleteEdge = useCallback((edge: Edge<GraphEdgeData>) => {
    if (isPending) return;
    if (!edge.data || !window.confirm(`Delete the link "${String(edge.label ?? "Path")}"?`)) return;
    setError("");
    startTransition(async () => {
      try {
        if (edge.data!.kind === "continue") {
          await setExplorationBlockContinueAction(edge.data!.recordId, null);
          updateBlock(edge.data!.recordId, (block) => ({
            ...block,
            continueToBlockId: null,
            continueTargetHandle: null,
            autoContinue: false
          }));
        } else if (edge.data!.kind === "choice") {
          await setExplorationChoiceBlockTargetAction(edge.data!.recordId, null);
          const sourceId = Number(edge.source);
          updateBlock(sourceId, (block) => ({
            ...block,
            options: block.options.map((option) => option.id === edge.data!.recordId
              ? { ...option, toBlockId: null, targetHandle: null }
              : option)
          }));
        } else {
          await setExplorationQuizOutcomeBlockTargetAction(edge.data!.recordId, null);
          const sourceId = Number(edge.source);
          updateBlock(sourceId, (block) => ({
            ...block,
            outcomes: block.outcomes.map((outcome) => outcome.id === edge.data!.recordId
              ? { ...outcome, toBlockId: null, targetHandle: null }
              : outcome)
          }));
        }
        setSelectedEdgeId(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The link could not be deleted.");
      }
    });
  }, [isPending, updateBlock]);

  const deleteBlock = useCallback((blockId: number) => {
    if (isPending) return;
    if (!window.confirm("Delete this block? Linked paths will be reconnected when possible.")) return;
    setError("");
    startTransition(async () => {
      try {
        await deleteExplorationBlockAction(blockId);
        const next = blocksRef.current.filter((block) => block.id !== blockId).map((block) => ({
          ...block,
          continueToBlockId: block.continueToBlockId === blockId ? null : block.continueToBlockId,
          continueTargetHandle: block.continueToBlockId === blockId ? null : block.continueTargetHandle,
          autoContinue: block.continueToBlockId === blockId ? false : block.autoContinue,
          options: block.options.map((option) => option.toBlockId === blockId
            ? { ...option, toBlockId: null, targetHandle: null }
            : option),
          outcomes: block.outcomes.map((outcome) => outcome.toBlockId === blockId
            ? { ...outcome, toBlockId: null, targetHandle: null }
            : outcome)
        }));
        renderBlocks(next);
        setPast([]);
        setFuture([]);
        setSelectedNodeId(null);
        router.refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The block could not be deleted.");
      }
    });
  }, [isPending, renderBlocks, router]);

  const undo = useCallback(() => {
    const target = past.at(-1);
    if (!target || isPending) return;
    const current = blocksRef.current;
    setError("");
    startTransition(async () => {
      try {
        await restoreExplorationMapStateAction(explorationId, mapHistoryState(target), "undo");
        setPast((items) => items.slice(0, -1));
        setFuture((items) => [current, ...items].slice(0, MAP_HISTORY_LIMIT));
        renderBlocks(target);
      } catch (reason) {
        setPast([]);
        setFuture([]);
        setError(reason instanceof Error ? reason.message : "The map change could not be undone.");
      }
    });
  }, [explorationId, isPending, past, renderBlocks]);

  const redo = useCallback(() => {
    const target = future[0];
    if (!target || isPending) return;
    const current = blocksRef.current;
    setError("");
    startTransition(async () => {
      try {
        await restoreExplorationMapStateAction(explorationId, mapHistoryState(target), "redo");
        setFuture((items) => items.slice(1));
        setPast((items) => [...items, current].slice(-MAP_HISTORY_LIMIT));
        renderBlocks(target);
      } catch (reason) {
        setPast([]);
        setFuture([]);
        setError(reason instanceof Error ? reason.message : "The map change could not be redone.");
      }
    });
  }, [explorationId, future, isPending, renderBlocks]);

  useEffect(() => {
    function handleMapShortcut(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !isTypingTarget(event.target)) {
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          undo();
          return;
        }
        if (key === "y" || (key === "z" && event.shiftKey)) {
          event.preventDefault();
          redo();
          return;
        }
      }
      if (isPending) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTypingTarget(event.target)) return;
      const edge = edges.find((candidate) => candidate.id === selectedEdgeId);
      if (edge) deleteEdge(edge);
      else if (selectedNodeId) deleteBlock(selectedNodeId);
    }
    window.addEventListener("keydown", handleMapShortcut);
    return () => window.removeEventListener("keydown", handleMapShortcut);
  }, [deleteBlock, deleteEdge, edges, isPending, redo, selectedEdgeId, selectedNodeId, undo]);

  function selectionChanged(selection: OnSelectionChangeParams) {
    if (selection.nodes[0]) {
      setSelectedNodeId(Number(selection.nodes[0].id));
      setSelectedEdgeId(null);
    } else if (selection.edges[0]) {
      setSelectedNodeId(null);
      setSelectedEdgeId(selection.edges[0].id);
    }
  }

  function setEndpoint(endpoint: "start" | "end") {
    if (!selectedBlock || isPending) return;
    startTransition(async () => {
      try {
        await setExplorationBlockEndpointAction(selectedBlock.id, endpoint);
        const next = blocksRef.current.map((block) => ({
          ...block,
          ...(endpoint === "start" ? { isStart: block.id === selectedBlock.id } : { isEnd: block.id === selectedBlock.id }),
          ...(endpoint === "end" && block.id === selectedBlock.id ? { continueToBlockId: null, autoContinue: false } : {})
        }));
        commitBlocks(next);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The endpoint could not be changed.");
      }
    });
  }

  function saveBlockName(blockId: number, rawName: string) {
    if (isPending) return;
    const name = rawName.trim();
    const block = blocksRef.current.find((candidate) => candidate.id === blockId);
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

  return (
    <div ref={mapRef} className="exploration-block-map" aria-busy={isPending}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        connectionMode={ConnectionMode.Loose}
        isValidConnection={isValidMapConnection}
        onReconnect={reconnect}
        onReconnectStart={(_, edge) => {
          reconnectingEdgeRef.current = edge;
          setSelectedNodeId(null);
          setSelectedEdgeId(edge.id);
        }}
        onReconnectEnd={(_, edge) => {
          reconnectingEdgeRef.current = null;
          setSelectedNodeId(null);
          setSelectedEdgeId((current) => current === null || current === edge.id ? edge.id : current);
        }}
        reconnectRadius={EDGE_RECONNECT_RADIUS}
        connectionRadius={28}
        onSelectionChange={selectionChanged}
        onNodeClick={(_, node) => {
          setSelectedNodeId(Number(node.id));
          setSelectedEdgeId(null);
        }}
        onNodeDragStart={(_, node) => {
          setSelectedNodeId(Number(node.id));
          setSelectedEdgeId(null);
        }}
        onPaneClick={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }}
        onNodeDragStop={(_, node) => {
          const blockId = Number(node.id);
          setSelectedNodeId(blockId);
          setSelectedEdgeId(null);
          const current = blocksRef.current;
          const block = current.find((candidate) => candidate.id === blockId);
          if (!block || (block.canvasX === node.position.x && block.canvasY === node.position.y)) return;
          setError("");
          startTransition(async () => {
            try {
              await updateExplorationBlockCanvasPositionsAction(explorationId, [{ blockId, x: node.position.x, y: node.position.y }]);
              commitBlocks(current.map((candidate) => candidate.id === blockId
                ? { ...candidate, canvasX: node.position.x, canvasY: node.position.y }
                : candidate));
            } catch (reason) {
              renderBlocks(current);
              setError(reason instanceof Error ? reason.message : "The block position could not be saved.");
            }
          });
        }}
        nodesConnectable={!isPending}
        nodesDraggable={!isPending}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.25}
        maxZoom={1.5}
      >
        <svg className="exploration-map-marker-definitions" aria-hidden="true">
          <defs>
            <radialGradient id="exploration-edge-reconnect-handle">
              <stop offset="0%" stopColor="#226a46" />
              <stop offset="24%" stopColor="#226a46" />
              <stop offset="27%" stopColor="#fff" />
              <stop offset="38%" stopColor="#fff" />
              <stop offset="41%" stopColor="#226a46" stopOpacity="0.3" />
              <stop offset="52%" stopColor="#226a46" stopOpacity="0" />
            </radialGradient>
            <marker
              id="exploration-automatic-edge-marker"
              markerWidth="15"
              markerHeight="12"
              refX="13"
              refY="6"
              orient="auto"
              markerUnits="userSpaceOnUse"
              viewBox="0 0 15 12"
            >
              <path d="M1 1 L6 6 L1 11 M7 1 L12 6 L7 11" />
            </marker>
          </defs>
        </svg>
        <Panel className="exploration-block-map-add nodrag nopan" position="top-left">
          <ExplorationAddContentForm
            explorationId={explorationId}
            explorationSlug={explorationSlug}
            kinds={kinds}
            openEditorAfterCreate={false}
            getCanvasPosition={canvasViewportCenter}
          />
        </Panel>
        <Panel className="exploration-map-history-controls nodrag nopan" position="bottom-right">
          <button type="button" onClick={undo} disabled={isPending || past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo map change">
            <Undo2 size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={redo} disabled={isPending || future.length === 0} title="Redo (Ctrl+Y)" aria-label="Redo map change">
            <Redo2 size={16} aria-hidden="true" />
          </button>
        </Panel>
        {selectedBlock && (
          <Panel className="exploration-block-inspector nodrag nopan" position="top-right">
            <div className="exploration-block-inspector-name">
              <div className="exploration-block-inspector-label">
                <span>{selectedBlock.kind.toLocaleLowerCase().replaceAll("_", " ")}</span>
                <ExplorationBlockNameHelp />
              </div>
              <input
                key={`${selectedBlock.id}:${selectedBlock.name ?? ""}`}
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
                disabled={isPending}
              />
            </div>
            <Link className="button secondary" href={`/explorations/${explorationSlug}/edit?view=block&block=${selectedBlock.id}` as never}>Edit <ExternalLink size={14} /></Link>
            <button className="secondary" type="button" disabled={isPending} onClick={() => setEndpoint("start")}><Flag size={15} /> Set as start</button>
            <button className="secondary" type="button" disabled={isPending} onClick={() => setEndpoint("end")}><Signpost size={15} /> Set as end</button>
            <button className="danger" type="button" disabled={isPending} onClick={() => deleteBlock(selectedBlock.id)}><Trash2 size={15} /> Delete</button>
          </Panel>
        )}
        {error && <Panel className="exploration-map-error" position="bottom-center">{error}</Panel>}
        <Background color="#c8d3ca" gap={20} size={1} variant={BackgroundVariant.Dots} />
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
