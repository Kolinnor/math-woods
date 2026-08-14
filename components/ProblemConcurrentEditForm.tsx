"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ProblemEditActionState } from "@/lib/actions/problem-actions";
import { dictionaryForLocale } from "@/lib/i18n/dictionary";
import type { InterfaceLocale } from "@/lib/i18n/types";

type ProblemConcurrentEditFormProps = {
  action: (state: ProblemEditActionState, formData: FormData) => Promise<ProblemEditActionState>;
  baseVersion: number;
  latestHref: string;
  historyHref: string;
  children: ReactNode;
  locale?: InterfaceLocale;
};

const initialState: ProblemEditActionState = { status: "idle" };

export function ProblemConcurrentEditForm({
  action,
  baseVersion,
  latestHref,
  historyHref,
  children,
  locale = "en"
}: ProblemConcurrentEditFormProps) {
  const t = dictionaryForLocale(locale);
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
    if (window.confirm(t.contentEditor.conflictReloadConfirm)) {
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
            <strong>{t.contentEditor.conflictTitle}</strong>
            <p>
              {t.contentEditor.conflictIntro}
              {state.editorName ? t.contentEditor.conflictEditor(state.editorName) : ""}
              {state.editedAt ? t.contentEditor.conflictEditedAt(new Date(state.editedAt).toLocaleString(locale)) : ""}.
            </p>
            {state.conflictingFields.length > 0 && (
              <p>{t.contentEditor.conflictingFields(state.conflictingFields.join(", "))}</p>
            )}
            {acceptedConflictVersion === state.currentVersion && (
              <p><strong>{t.contentEditor.latestReviewed}</strong> {t.contentEditor.latestReviewedHelp}</p>
            )}
          </div>
          <div className="problem-edit-conflict-actions">
            <a href={latestHref} target="_blank" rel="noreferrer" className="button secondary">
              {t.contentEditor.viewLatest}
            </a>
            <a href={historyHref} target="_blank" rel="noreferrer" className="button secondary">
              {t.contentEditor.compareHistory}
            </a>
            {acceptedConflictVersion !== state.currentVersion && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  if (window.confirm(t.contentEditor.conflictReviewConfirm)) {
                    setAcceptedConflictVersion(state.currentVersion);
                  }
                }}
              >
                {t.contentEditor.reviewedLatest}
              </button>
            )}
            <button type="button" onClick={reloadLatest}>
              {t.contentEditor.reloadLatest}
            </button>
          </div>
        </section>
      )}
      {children}
    </form>
  );
}
