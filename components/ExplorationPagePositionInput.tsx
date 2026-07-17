"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setExplorationPagePositionAction } from "@/lib/actions/exploration-actions";

export function ExplorationPagePositionInput({
  max,
  pageId,
  pageTitle,
  position
}: {
  max: number;
  pageId: number;
  pageTitle: string;
  position: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(position));
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => setValue(String(position)), [position]);

  function commitPosition() {
    if (isPending) return;
    const requestedPosition = Number(value);
    if (!Number.isFinite(requestedPosition)) {
      setValue(String(position));
      return;
    }
    const normalizedPosition = Math.max(1, Math.min(max, Math.trunc(requestedPosition)));
    setValue(String(normalizedPosition));
    if (normalizedPosition === position) return;

    setError("");
    startTransition(async () => {
      try {
        const result = await setExplorationPagePositionAction(pageId, normalizedPosition);
        setValue(String(result.position));
        router.refresh();
      } catch {
        setValue(String(position));
        setError(`Could not move ${pageTitle}.`);
      }
    });
  }

  return (
    <div className="studio-page-position-control">
      <input
        aria-label={`Position of ${pageTitle}`}
        className="studio-page-position-input"
        disabled={isPending}
        inputMode="numeric"
        max={max}
        min={1}
        onBlur={commitPosition}
        onChange={(event) => setValue(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        step={1}
        type="number"
        value={value}
      />
      {error && <span className="sr-only" role="alert">{error}</span>}
    </div>
  );
}
