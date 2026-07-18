"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { createExplorationBlockAction } from "@/lib/actions/exploration-actions";

type KindOption = {
  label: string;
  value: string;
};

export function ExplorationAddContentForm({
  explorationSlug,
  pageId,
  kinds
}: {
  explorationSlug: string;
  pageId: number;
  kinds: KindOption[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState("MARKDOWN");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const isReference = kind === "PROBLEM" || kind === "CONCEPT";
  const selectedLabel = kinds.find((option) => option.value === kind)?.label.toLocaleLowerCase() ?? "content";

  function createBlock(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const { blockId } = await createExplorationBlockAction(pageId, formData);
        router.replace(`/explorations/${explorationSlug}/edit?view=page&page=${pageId}#block-${blockId}` as never, { scroll: false });
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
          <span>{kind === "PROBLEM" ? "Problem slug" : "Concept slug"}</span>
          <input
            key={kind}
            name="referenceSlug"
            required
            placeholder={kind === "PROBLEM" ? "problem-slug" : "concept-slug"}
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
