"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createExplorationPageAction } from "@/lib/actions/exploration-actions";

export function ExplorationAddPageForm({
  explorationId,
  explorationSlug
}: {
  explorationId: number;
  explorationSlug: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function createPage(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const { pageId } = await createExplorationPageAction(explorationId, formData);
        router.replace(`/explorations/${explorationSlug}/edit?page=${pageId}` as never, { scroll: false });
      } catch {
        setError("The page could not be created. Please try again.");
      }
    });
  }

  return (
    <form action={createPage} aria-busy={isPending} className="studio-add-page-form">
      <label>
        <span>Page title</span>
        <input name="title" required placeholder="A surprising detour" disabled={isPending} />
      </label>
      <button type="submit" disabled={isPending}>{isPending ? "Adding..." : "Add page"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
