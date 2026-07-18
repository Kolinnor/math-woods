"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
import { setExplorationBlockPositionAction } from "@/lib/actions/exploration-actions";

export type ExplorationBlockListItem = {
  id: number;
  href: string;
  label: string;
};

export function ExplorationBlockList({
  currentBlockId,
  initialBlocks
}: {
  currentBlockId: number | null;
  initialBlocks: ExplorationBlockListItem[];
}) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setBlocks(initialBlocks), [initialBlocks]);

  function moveBlock(blockId: number, targetIndex: number) {
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(blocks.length - 1, targetIndex));
    if (sourceIndex === nextIndex) return;
    const previous = blocks;
    const reordered = [...blocks];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    setBlocks(reordered);
    setError("");
    startTransition(async () => {
      try {
        await setExplorationBlockPositionAction(blockId, nextIndex + 1);
      } catch {
        setBlocks(previous);
        setError("The block order could not be saved.");
      }
    });
  }

  function dropBlock(event: DragEvent<HTMLDivElement>, targetId: number) {
    event.preventDefault();
    if (draggedId === null) return;
    moveBlock(draggedId, blocks.findIndex((block) => block.id === targetId));
    setDraggedId(null);
    setDropTargetId(null);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, blockId: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const index = blocks.findIndex((block) => block.id === blockId);
    moveBlock(blockId, index + (event.key === "ArrowUp" ? -1 : 1));
  }

  return (
    <nav className="studio-block-list-nav" aria-busy={isPending} aria-label="Exploration blocks">
      {blocks.map((block, index) => (
        <div
          key={block.id}
          className={[
            "studio-block-row",
            currentBlockId === block.id ? "is-current" : "",
            draggedId === block.id ? "is-dragging" : "",
            dropTargetId === block.id && draggedId !== block.id ? "is-drop-target" : ""
          ].filter(Boolean).join(" ")}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetId(block.id);
          }}
          onDrop={(event) => dropBlock(event, block.id)}
        >
          <button
            type="button"
            className="studio-block-drag-handle"
            draggable={!isPending}
            disabled={isPending}
            aria-label={`Move block ${index + 1}. Use the up and down arrow keys to reorder.`}
            title="Drag to reorder"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(block.id));
              setDraggedId(block.id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTargetId(null);
            }}
            onKeyDown={(event) => moveWithKeyboard(event, block.id)}
          >
            <GripVertical size={15} aria-hidden="true" />
          </button>
          <span className="studio-block-row-number">{index + 1}</span>
          <Link href={block.href as never}>{block.label}</Link>
        </div>
      ))}
      {error && <p className="form-error studio-block-order-error" role="alert">{error}</p>}
    </nav>
  );
}
