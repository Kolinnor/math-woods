"use client";

import type { ExplorationBlockKind } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  setExplorationBlockPositionAction,
  updateExplorationBlockAction
} from "@/lib/actions/exploration-actions";

export function ExplorationBlockHeaderControls({
  blockId,
  formId,
  kind,
  kinds,
  max,
  position
}: {
  blockId: number;
  formId: string;
  kind: ExplorationBlockKind;
  kinds: Array<{ label: string; value: ExplorationBlockKind }>;
  max: number;
  position: number;
}) {
  const router = useRouter();
  const [positionValue, setPositionValue] = useState(String(position));
  const [kindValue, setKindValue] = useState(kind);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setPositionValue(String(position)), [position]);
  useEffect(() => setKindValue(kind), [kind]);

  function currentFormData() {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) throw new Error("Block form not found.");
    return { form, formData: new FormData(form) };
  }

  function commitPosition() {
    if (isPending) return;
    const requestedPosition = Number(positionValue);
    if (!Number.isFinite(requestedPosition)) {
      setPositionValue(String(position));
      return;
    }
    const normalizedPosition = Math.max(1, Math.min(max, Math.trunc(requestedPosition)));
    setPositionValue(String(normalizedPosition));
    if (normalizedPosition === position) return;

    setError("");
    startTransition(async () => {
      try {
        const { form, formData } = currentFormData();
        if (!form.reportValidity()) {
          setPositionValue(String(position));
          return;
        }
        formData.set("kind", kindValue);
        await updateExplorationBlockAction(blockId, formData);
        const result = await setExplorationBlockPositionAction(blockId, normalizedPosition);
        setPositionValue(String(result.position));
        router.refresh();
      } catch {
        setPositionValue(String(position));
        setError("Could not move this block.");
      }
    });
  }

  function commitKind(nextKind: ExplorationBlockKind) {
    setKindValue(nextKind);
    if (nextKind === kind || isPending) return;

    setError("");
    startTransition(async () => {
      try {
        const { formData } = currentFormData();
        formData.set("kind", nextKind);
        await updateExplorationBlockAction(blockId, formData);
        router.refresh();
      } catch {
        setKindValue(kind);
        setError("Could not change this block type.");
      }
    });
  }

  return (
    <div className="studio-block-heading">
      <span>Block n&deg;</span>
      <input
        aria-label={`Position of block ${position}`}
        className="studio-block-position-input"
        disabled={isPending}
        inputMode="numeric"
        max={max}
        min={1}
        onBlur={commitPosition}
        onChange={(event) => setPositionValue(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        step={1}
        type="number"
        value={positionValue}
      />
      <span aria-hidden="true">-</span>
      <select
        aria-label={`Type of block ${position}`}
        className="studio-block-kind-select"
        disabled={isPending}
        onChange={(event) => commitKind(event.target.value as ExplorationBlockKind)}
        value={kindValue}
      >
        {kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  );
}
