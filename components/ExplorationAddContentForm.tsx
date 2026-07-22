"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createExplorationGraphBlockAction } from "@/lib/actions/exploration-actions";

type KindOption = {
  label: string;
  value: string;
};

export function ExplorationAddContentForm({
  explorationId,
  explorationSlug,
  kinds,
  openEditorAfterCreate = true,
  getCanvasPosition
}: {
  explorationId: number;
  explorationSlug: string;
  kinds: KindOption[];
  openEditorAfterCreate?: boolean;
  getCanvasPosition?: () => { x: number; y: number } | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState("MARKDOWN");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const isReference = kind === "CONCEPT";
  const selectedLabel = kinds.find((option) => option.value === kind)?.label.toLocaleLowerCase() ?? "content";

  function createBlock(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const canvasPosition = getCanvasPosition?.();
        if (canvasPosition) {
          formData.set("canvasX", String(canvasPosition.x));
          formData.set("canvasY", String(canvasPosition.y));
        }
        const { blockId } = await createExplorationGraphBlockAction(explorationId, formData);
        if (openEditorAfterCreate) {
          router.replace(`/explorations/${explorationSlug}/edit?view=block&block=${blockId}` as never, { scroll: false });
        } else {
          router.refresh();
        }
      } catch {
        setError("The content could not be added. Please try again.");
      }
    });
  }

  return (
    <form action={createBlock} aria-busy={isPending} className="studio-add-content-form">
      <label>
        <span>Content type</span>
        <select name="kind" value={kind} onChange={(event) => setKind(event.target.value)} disabled={isPending}>
          {kinds.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      {isReference && (
        <label className="studio-add-content-title">
          <span>Concept slug</span>
          <input
            key={kind}
            name="referenceSlug"
            required
            placeholder="concept-slug"
            disabled={isPending}
          />
        </label>
      )}

      <button type="submit" disabled={isPending}>
        <Plus size={16} /> {isPending ? "Adding..." : `Add ${selectedLabel}`}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
