"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type DragEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, GripVertical, Trash2 } from "lucide-react";
import {
  createExplorationBlockFolderAction,
  deleteExplorationBlockFolderAction,
  organizeExplorationBlocksAction,
  reorderExplorationBlockFoldersAction,
  renameExplorationBlockFolderAction
} from "@/lib/actions/exploration-actions";
import {
  explorationBlocksInFolder,
  moveExplorationBlockFolder,
  moveExplorationBlockToFolder,
  orderExplorationBlocksByFolders
} from "@/lib/exploration-block-folders";

export type ExplorationBlockListItem = {
  id: number;
  folderId: number | null;
  href: string;
  label: string;
};

export type ExplorationBlockFolderListItem = {
  id: number;
  name: string;
  position: number;
};

function folderKey(folderId: number | null) {
  return folderId === null ? "unfiled" : String(folderId);
}

export function ExplorationBlockList({
  explorationId,
  currentBlockId,
  initialBlocks,
  initialFolders
}: {
  explorationId: number;
  currentBlockId: number | null;
  initialBlocks: ExplorationBlockListItem[];
  initialFolders: ExplorationBlockFolderListItem[];
}) {
  const [blocks, setBlocks] = useState(() => orderExplorationBlocksByFolders(initialBlocks, initialFolders.map((folder) => folder.id)));
  const [folders, setFolders] = useState(initialFolders);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [folderName, setFolderName] = useState("");
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<{ id: number; placement: "before" | "after" } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setFolders(initialFolders);
    setBlocks(orderExplorationBlocksByFolders(initialBlocks, initialFolders.map((folder) => folder.id)));
  }, [initialBlocks, initialFolders]);

  function blocksInFolder(folderId: number | null, source = blocks) {
    return explorationBlocksInFolder(source, folders.map((folder) => folder.id), folderId);
  }

  function moveBlock(blockId: number, targetFolderId: number | null, targetIndex: number) {
    const moving = blocks.find((block) => block.id === blockId);
    if (!moving) return;
    const previous = blocks;
    const next = moveExplorationBlockToFolder(
      blocks,
      folders.map((folder) => folder.id),
      blockId,
      targetFolderId,
      targetIndex
    );
    if (
      moving.folderId === targetFolderId
      && previous.findIndex((block) => block.id === blockId) === next.findIndex((block) => block.id === blockId)
    ) return;

    setBlocks(next);
    setError("");
    startTransition(async () => {
      try {
        await organizeExplorationBlocksAction(blockId, targetFolderId, next.map((block) => block.id));
      } catch {
        setBlocks(previous);
        setError("The block organization could not be saved.");
      }
    });
  }

  function dropOnBlock(event: DragEvent<HTMLDivElement>, target: ExplorationBlockListItem) {
    event.preventDefault();
    event.stopPropagation();
    if (draggedId === null) return;
    moveBlock(draggedId, target.folderId, blocksInFolder(target.folderId).findIndex((block) => block.id === target.id));
    setDraggedId(null);
    setDropTargetId(null);
    setDropFolder(null);
  }

  function dropInFolder(event: DragEvent<HTMLElement>, targetFolderId: number | null) {
    event.preventDefault();
    if (draggedId === null) return;
    moveBlock(draggedId, targetFolderId, blocksInFolder(targetFolderId).length);
    setDraggedId(null);
    setDropTargetId(null);
    setDropFolder(null);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, block: ExplorationBlockListItem) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const group = blocksInFolder(block.folderId);
    const index = group.findIndex((candidate) => candidate.id === block.id);
    const targetIndex = index + (event.key === "ArrowUp" ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= group.length) return;
    moveBlock(block.id, block.folderId, targetIndex);
  }

  function moveFolder(folderId: number, targetFolderId: number, placement: "before" | "after") {
    const previous = folders;
    const next = moveExplorationBlockFolder(folders, folderId, targetFolderId, placement);
    if (next === folders || next.every((folder, index) => folder.id === folders[index]?.id)) return;
    setFolders(next.map((folder, index) => ({ ...folder, position: index + 1 })));
    setError("");
    startTransition(async () => {
      try {
        await reorderExplorationBlockFoldersAction(explorationId, next.map((folder) => folder.id));
      } catch {
        setFolders(previous);
        setError("The folder order could not be saved.");
      }
    });
  }

  function moveFolderWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, folder: ExplorationBlockFolderListItem) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const index = folders.findIndex((candidate) => candidate.id === folder.id);
    const target = folders[index + (event.key === "ArrowUp" ? -1 : 1)];
    if (!target) return;
    moveFolder(folder.id, target.id, event.key === "ArrowUp" ? "before" : "after");
  }

  function dropFolderOnFolder(event: DragEvent<HTMLElement>, targetFolderId: number) {
    event.preventDefault();
    event.stopPropagation();
    if (draggedFolderId === null) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    moveFolder(draggedFolderId, targetFolderId, placement);
    setDraggedFolderId(null);
    setFolderDropTarget(null);
  }

  function createFolder() {
    setError("");
    startTransition(async () => {
      try {
        const folder = await createExplorationBlockFolderAction(explorationId);
        setFolders((items) => items.some((item) => item.id === folder.id) ? items : [...items, folder]);
        setEditingFolderId(folder.id);
        setFolderName(folder.name);
      } catch {
        setError("The folder could not be created.");
      }
    });
  }

  function beginRename(folder: ExplorationBlockFolderListItem) {
    setEditingFolderId(folder.id);
    setFolderName(folder.name);
  }

  function saveFolderName(folder: ExplorationBlockFolderListItem) {
    if (editingFolderId !== folder.id) return;
    const name = folderName.trim();
    if (!name) {
      setError("A folder name is required.");
      return;
    }
    setEditingFolderId(null);
    if (name === folder.name) return;
    const previous = folders;
    setFolders((items) => items.map((item) => item.id === folder.id ? { ...item, name } : item));
    setError("");
    startTransition(async () => {
      try {
        await renameExplorationBlockFolderAction(folder.id, name);
      } catch {
        setFolders(previous);
        setError("The folder name could not be saved.");
      }
    });
  }

  function deleteFolder(folder: ExplorationBlockFolderListItem) {
    if (!window.confirm(`Delete the folder "${folder.name}"? Its blocks will remain in the exploration.`)) return;
    const previousFolders = folders;
    const previousBlocks = blocks;
    const nextFolders = folders.filter((item) => item.id !== folder.id);
    const nextBlocks = orderExplorationBlocksByFolders(
      blocks.map((block) => block.folderId === folder.id ? { ...block, folderId: null } : block),
      nextFolders.map((item) => item.id)
    );
    setFolders(nextFolders);
    setBlocks(nextBlocks);
    setError("");
    startTransition(async () => {
      try {
        await deleteExplorationBlockFolderAction(folder.id);
      } catch {
        setFolders(previousFolders);
        setBlocks(previousBlocks);
        setError("The folder could not be deleted.");
      }
    });
  }

  function toggleFolder(id: string) {
    setCollapsedFolders((items) => {
      const next = new Set(items);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderBlock(block: ExplorationBlockListItem) {
    const index = blocks.findIndex((candidate) => candidate.id === block.id);
    return (
      <div
        key={block.id}
        className={[
          "studio-block-row",
          currentBlockId === block.id ? "is-current" : "",
          draggedId === block.id ? "is-dragging" : "",
          dropTargetId === block.id && draggedId !== block.id ? "is-drop-target" : ""
        ].filter(Boolean).join(" ")}
        onDragOver={(event) => {
          if (draggedFolderId !== null) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          setDropTargetId(block.id);
          setDropFolder(folderKey(block.folderId));
        }}
        onDrop={(event) => {
          if (draggedFolderId === null) dropOnBlock(event, block);
        }}
      >
        <button
          type="button"
          className="studio-block-drag-handle"
          draggable={!isPending}
          disabled={isPending}
          aria-label={`Move block ${index + 1}. Use the up and down arrow keys to reorder it inside this folder.`}
          title="Drag to reorder or move to a folder"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(block.id));
            setDraggedId(block.id);
          }}
          onDragEnd={() => {
            setDraggedId(null);
            setDropTargetId(null);
            setDropFolder(null);
          }}
          onKeyDown={(event) => moveWithKeyboard(event, block)}
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <span className="studio-block-row-number">{index + 1}</span>
        <Link href={block.href as never}>{block.label}</Link>
      </div>
    );
  }

  const sections: Array<ExplorationBlockFolderListItem | null> = [null, ...folders];

  return (
    <div className="studio-block-organizer" aria-busy={isPending}>
      <button type="button" className="secondary studio-new-folder-button" disabled={isPending} onClick={createFolder}>
        <FolderPlus size={15} /> New folder
      </button>
      <nav className="studio-block-list-nav" aria-label="Exploration blocks">
        {sections.map((folder) => {
          const id = folderKey(folder?.id ?? null);
          const folderBlocks = blocksInFolder(folder?.id ?? null);
          const collapsed = collapsedFolders.has(id);
          return (
            <section
              key={id}
              className={[
                "studio-block-folder",
                dropFolder === id && draggedId !== null ? "is-drop-target" : "",
                folder !== null && folderDropTarget?.id === folder.id ? `is-folder-drop-${folderDropTarget.placement}` : "",
                folder !== null && draggedFolderId === folder.id ? "is-folder-dragging" : ""
              ].filter(Boolean).join(" ")}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (draggedFolderId !== null && folder !== null) {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setFolderDropTarget({
                    id: folder.id,
                    placement: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"
                  });
                  return;
                }
                setDropFolder(id);
                setDropTargetId(null);
              }}
              onDrop={(event) => {
                if (folder !== null && draggedFolderId !== null) dropFolderOnFolder(event, folder.id);
                else dropInFolder(event, folder?.id ?? null);
              }}
            >
              <div className="studio-block-folder-heading">
                <button
                  type="button"
                  className="icon-button studio-folder-toggle"
                  aria-expanded={!collapsed}
                  title={collapsed ? "Expand folder" : "Collapse folder"}
                  onClick={() => toggleFolder(id)}
                >
                  {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                </button>
                {folder === null ? (
                  <span className="studio-folder-drag-placeholder" />
                ) : (
                  <button
                    type="button"
                    className="studio-folder-drag-handle"
                    draggable={!isPending}
                    disabled={isPending}
                    aria-label={`Move folder ${folder.name}. Use the up and down arrow keys to reorder it.`}
                    title="Drag to reorder folder"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", `folder:${folder.id}`);
                      setDraggedFolderId(folder.id);
                      setDraggedId(null);
                    }}
                    onDragEnd={() => {
                      setDraggedFolderId(null);
                      setFolderDropTarget(null);
                    }}
                    onKeyDown={(event) => moveFolderWithKeyboard(event, folder)}
                  >
                    <GripVertical size={15} aria-hidden="true" />
                  </button>
                )}
                {collapsed ? <Folder size={15} aria-hidden="true" /> : <FolderOpen size={15} aria-hidden="true" />}
                {folder === null ? (
                  <span className="studio-folder-static-name">Unsorted</span>
                ) : editingFolderId === folder.id ? (
                  <input
                    autoFocus
                    className="studio-folder-name-input"
                    value={folderName}
                    maxLength={160}
                    aria-label="Folder name"
                    onChange={(event) => setFolderName(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={() => saveFolderName(folder)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setEditingFolderId(null);
                    }}
                  />
                ) : (
                  <button type="button" className="studio-folder-name-button" title="Click to rename" onClick={() => beginRename(folder)}>
                    {folder.name}
                  </button>
                )}
                <span className="studio-folder-count">{folderBlocks.length}</span>
                {folder !== null && (
                  <button type="button" className="icon-button danger studio-folder-delete" title="Delete folder" onClick={() => deleteFolder(folder)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {!collapsed && (
                <div className="studio-block-folder-content">
                  {folderBlocks.length ? folderBlocks.map(renderBlock) : <p>Drop blocks here</p>}
                </div>
              )}
            </section>
          );
        })}
      </nav>
      {error && <p className="form-error studio-block-order-error" role="alert">{error}</p>}
    </div>
  );
}
