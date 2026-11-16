"use client";

import type { FormEvent, ReactNode } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  createProblemFormAction,
  type ProblemCreateActionState,
  type ProblemCreateMissingField
} from "@/lib/actions/problem-actions";
import { TRANSLATION_LINK_OVERRIDE_FIELD } from "@/lib/translation-link-warning";
import { SAME_TRANSLATION_TITLE_OVERRIDE_FIELD } from "@/lib/translation-title-guard";

const initialState: ProblemCreateActionState = { error: null };

type ProblemCreateFormLabels = {
  keepSameTranslationTitle: string;
  missingDifficulty: string;
  missingDomain: string;
  missingFieldsHeading: string;
  publishAnyway: string;
  sameTranslationTitleHeading: string;
  sameTranslationTitleWarning: string;
  translationLinksHeading: string;
};

function missingClassificationFields(form: HTMLFormElement): ProblemCreateMissingField[] {
  const data = new FormData(form);
  const missing: ProblemCreateMissingField[] = [];
  if (!String(data.get("difficulty") ?? "").trim()) missing.push("difficulty");
  if (!data.getAll("domains").some((value) => String(value).trim())) missing.push("domain");
  return missing;
}

export function ProblemCreateForm({
  children,
  labels,
  requireClassification = false
}: {
  children: ReactNode;
  labels: ProblemCreateFormLabels;
  /** Require an explicit difficulty and at least one domain before submitting. */
  requireClassification?: boolean;
}) {
  const [state, formAction] = useActionState(createProblemFormAction, initialState);
  const [clientMissing, setClientMissing] = useState<{ fields: ProblemCreateMissingField[]; attempt: number }>({
    fields: [],
    attempt: 0
  });
  const errorRef = useRef<HTMLDivElement | null>(null);
  const missingRef = useRef<HTMLDivElement | null>(null);
  const serverMissing = state.errorKind === "missing-fields" ? state.missingFields ?? [] : [];
  const missingFields = clientMissing.fields.length ? clientMissing.fields : serverMissing;
  const showActionError = Boolean(state.error) && state.errorKind !== "missing-fields";

  useEffect(() => {
    const target = missingFields.length ? missingRef.current : showActionError ? errorRef.current : null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
  }, [state, clientMissing.attempt, missingFields.length, showActionError]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!requireClassification) return;
    const missing = missingClassificationFields(event.currentTarget);
    setClientMissing((current) => ({ fields: missing, attempt: current.attempt + 1 }));
    if (missing.length) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="problem-compose-form">
      {state.sameTranslationTitleConfirmed && (
        <input type="hidden" name={SAME_TRANSLATION_TITLE_OVERRIDE_FIELD} value="confirm" />
      )}
      {missingFields.length > 0 && (
        <div ref={missingRef} className="quality-banner quality-needs-work" role="alert" tabIndex={-1}>
          <strong>{labels.missingFieldsHeading}</strong>
          {missingFields.includes("difficulty") && <p>{labels.missingDifficulty}</p>}
          {missingFields.includes("domain") && <p>{labels.missingDomain}</p>}
        </div>
      )}
      {showActionError && (
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
