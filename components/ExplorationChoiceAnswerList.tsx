"use client";

import { useEffect, useState, useTransition, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { AutoSaveForm } from "@/components/AutoSaveForm";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { ExplorationChoiceActionFields } from "@/components/ExplorationChoiceActionFields";
import {
  deleteExplorationOptionAction,
  setExplorationOptionPositionAction,
  updateExplorationOptionAction
} from "@/lib/actions/exploration-actions";

type ChoiceAnswer = {
  id: number;
  label: string;
  toBlockId: number | null;
};

export function ExplorationChoiceAnswerList({
  blocks,
  currentBlockId,
  initialAnswers
}: {
  blocks: Array<{ id: number; label: string }>;
  currentBlockId: number;
  initialAnswers: ChoiceAnswer[];
}) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setAnswers(initialAnswers), [initialAnswers]);

  function moveAnswer(answerId: number, targetIndex: number) {
    const sourceIndex = answers.findIndex((answer) => answer.id === answerId);
    if (sourceIndex < 0) return;
    const nextIndex = Math.max(0, Math.min(answers.length - 1, targetIndex));
    if (sourceIndex === nextIndex) return;
    const previous = answers;
    const reordered = [...answers];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    setAnswers(reordered);
    setError("");
    startTransition(async () => {
      try {
        await setExplorationOptionPositionAction(answerId, nextIndex + 1);
      } catch {
        setAnswers(previous);
        setError("The answer order could not be saved.");
      }
    });
  }

  function dropAnswer(event: DragEvent<HTMLDivElement>, targetId: number) {
    event.preventDefault();
    if (draggedId === null) return;
    moveAnswer(draggedId, answers.findIndex((answer) => answer.id === targetId));
    setDraggedId(null);
    setDropTargetId(null);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, answerId: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const index = answers.findIndex((answer) => answer.id === answerId);
    moveAnswer(answerId, index + (event.key === "ArrowUp" ? -1 : 1));
  }

  return (
    <div className="studio-choice-answer-list" aria-busy={isPending}>
      {answers.map((answer, index) => (
        <div
          key={answer.id}
          className={[
            "studio-option-row",
            "studio-choice-answer-row",
            draggedId === answer.id ? "is-dragging" : "",
            dropTargetId === answer.id && draggedId !== answer.id ? "is-drop-target" : ""
          ].filter(Boolean).join(" ")}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDropTargetId(answer.id);
          }}
          onDrop={(event) => dropAnswer(event, answer.id)}
        >
          <button
            type="button"
            className="studio-block-drag-handle studio-option-drag-handle"
            draggable={!isPending}
            disabled={isPending}
            aria-label={`Move answer ${index + 1}. Use the up and down arrow keys to reorder.`}
            title="Drag to reorder"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(answer.id));
              setDraggedId(answer.id);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTargetId(null);
            }}
            onKeyDown={(event) => moveWithKeyboard(event, answer.id)}
          >
            <GripVertical size={15} aria-hidden="true" />
          </button>
          <div className="studio-choice-answer-fields">
            <AutoSaveForm action={updateExplorationOptionAction.bind(null, answer.id)} className="studio-option-autosave-form" statusClassName="sr-only">
              <label><span>Label</span><input name="label" defaultValue={answer.label} required /></label>
              <ExplorationChoiceActionFields blocks={blocks} currentBlockId={currentBlockId} toBlockId={answer.toBlockId} />
            </AutoSaveForm>
            <form action={deleteExplorationOptionAction.bind(null, answer.id)} className="studio-option-delete">
              <ConfirmSubmitButton message="Delete this option?" className="icon-button danger" title="Delete option"><Trash2 size={15} /></ConfirmSubmitButton>
            </form>
          </div>
        </div>
      ))}
      {error && <p className="form-error studio-option-order-error" role="alert">{error}</p>}
    </div>
  );
}
