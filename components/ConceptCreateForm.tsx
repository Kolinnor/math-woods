"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef } from "react";
import {
  createConceptFormAction,
  type ConceptCreateActionState
} from "@/lib/actions/concept-actions";
import { TRANSLATION_LINK_OVERRIDE_FIELD } from "@/lib/translation-link-warning";
import { SAME_TRANSLATION_TITLE_OVERRIDE_FIELD } from "@/lib/translation-title-guard";

const initialState: ConceptCreateActionState = { error: null };

type ConceptCreateFormLabels = {
  keepSameTranslationTitle: string;
  publishAnyway: string;
  sameTranslationTitleHeading: string;
  sameTranslationTitleWarning: string;
  translationLinksHeading: string;
};

export function ConceptCreateForm({
  children,
  labels
}: {
  children: ReactNode;
  labels: ConceptCreateFormLabels;
}) {
  const [state, formAction] = useActionState(createConceptFormAction, initialState);
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
    <form action={formAction} className="panel grid gap-4 p-5">
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
