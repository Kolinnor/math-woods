"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ProblemEditActionState } from "@/lib/actions/problem-actions";

type ProblemConcurrentEditFormProps = {
  action: (state: ProblemEditActionState, formData: FormData) => Promise<ProblemEditActionState>;
  baseVersion: number;
  latestHref: string;
  historyHref: string;
  children: ReactNode;
};

const initialState: ProblemEditActionState = { status: "idle" };

export function ProblemConcurrentEditForm({
  action,
  baseVersion,
  latestHref,
  historyHref,
  children
}: ProblemConcurrentEditFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const [acceptedConflictVersion, setAcceptedConflictVersion] = useState<number | null>(null);
  const conflictRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (state.status !== "conflict") return;
    const conflict = conflictRef.current;
    if (!conflict) return;

    conflict.classList.remove("problem-edit-conflict-highlight");
    void conflict.offsetWidth;
    conflict.classList.add("problem-edit-conflict-highlight");
    conflict.focus({ preventScroll: true });
    conflict.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });

    const timeout = window.setTimeout(() => {
      conflict.classList.remove("problem-edit-conflict-highlight");
    }, 1800);

    return () => window.clearTimeout(timeout);
  }, [state]);

  function reloadLatest() {
    if (window.confirm("Reload the latest version? Your unsaved form changes will be discarded.")) {
      window.location.reload();
    }
  }

  return (
    <form action={formAction} className="problem-compose-form">
      <input type="hidden" name="baseVersion" value={baseVersion} />
      {acceptedConflictVersion !== null && (
        <input type="hidden" name="acceptedConflictVersion" value={acceptedConflictVersion} />
      )}
      {state.status === "conflict" && (
        <section
          ref={conflictRef}
          className="problem-edit-conflict"
          role="alert"
          aria-atomic="true"
          tabIndex={-1}
        >
          <div>
            <strong>This problem changed while you were editing it.</strong>
            <p>
              Nothing was overwritten. Your changes are still in this form
              {state.editorName ? `; the newer version was saved by ${state.editorName}` : ""}
              {state.editedAt ? ` at ${new Date(state.editedAt).toLocaleString()}` : ""}.
            </p>
            {state.conflictingFields.length > 0 && (
              <p>Both versions changed: {state.conflictingFields.join(", ")}.</p>
            )}
            {acceptedConflictVersion === state.currentVersion && (
              <p><strong>Latest version reviewed.</strong> Saving now will keep newer untouched fields and use your form for the conflicts.</p>
            )}
          </div>
          <div className="problem-edit-conflict-actions">
            <a href={latestHref} target="_blank" rel="noreferrer" className="button secondary">
              View latest
            </a>
            <a href={historyHref} target="_blank" rel="noreferrer" className="button secondary">
              Compare history
            </a>
            {acceptedConflictVersion !== state.currentVersion && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (window.confirm("Confirm that you reviewed the latest version and merged the conflicting fields into this form.")) {
                    setAcceptedConflictVersion(state.currentVersion);
                  }
                }}
              >
                I reviewed the latest version
              </button>
            )}
            <button type="button" onClick={reloadLatest}>
              Reload latest
            </button>
          </div>
        </section>
      )}
      {children}
    </form>
  );
}
