"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef } from "react";
import {
  createProblemFormAction,
  type ProblemCreateActionState
} from "@/lib/actions/problem-actions";
import { TRANSLATION_LINK_OVERRIDE_FIELD } from "@/lib/translation-link-warning";
import { SAME_TRANSLATION_TITLE_OVERRIDE_FIELD } from "@/lib/translation-title-guard";

const initialState: ProblemCreateActionState = { error: null };

type ProblemCreateFormLabels = {
  keepSameTranslationTitle: string;
  publishAnyway: string;
  sameTranslationTitleHeading: string;
  sameTranslationTitleWarning: string;
  translationLinksHeading: string;
};

export function ProblemCreateForm({
  children,
  labels
}: {
  children: ReactNode;
  labels: ProblemCreateFormLabels;
}) {
  const [state, formAction] = useActionState(createProblemFormAction, initialState);
  const errorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state.error || !errorRef.current) return;
    errorRef.current.focus({ preventScroll: true });
    errorRef.current.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
  }, [state.error]);

  return (
    <form action={formAction} className="problem-compose-form">
      {state.sameTranslationTitleConfirmed && (
        <input type="hidden" name={SAME_TRANSLATION_TITLE_OVERRIDE_FIELD} value="confirm" />
      )}
      {state.error && (
        <div ref={errorRef} className="quality-banner translation-link-warning" role="alert" tabIndex={-1}>
          <strong>
            {state.errorKind === "same-translation-title"
              ? labels.sameTranslationTitleHeading
              : labels.translationLinksHeading}
          </strong>
          <p>
            {state.errorKind === "same-translation-title"
              ? labels.sameTranslationTitleWarning
              : state.error}
          </p>
          <button
            type="submit"
            name={
              state.errorKind === "same-translation-title"
                ? SAME_TRANSLATION_TITLE_OVERRIDE_FIELD
                : TRANSLATION_LINK_OVERRIDE_FIELD
            }
            value="confirm"
            className="secondary"
          >
            {state.errorKind === "same-translation-title"
              ? labels.keepSameTranslationTitle
              : labels.publishAnyway}
          </button>
        </div>
      )}
      {children}
    </form>
  );
}
