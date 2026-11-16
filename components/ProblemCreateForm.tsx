"use client";

import type { FormEvent, ReactNode } from "react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { ConceptLinkReminder, revealBanner, type ConceptLinkReminderLabels } from "@/components/ConceptLinkReminder";
import {
  createProblemFormAction,
  type ProblemCreateActionState,
  type ProblemCreateMissingField
} from "@/lib/actions/problem-actions";
import { CONCEPT_LINK_REMINDER_FIELD } from "@/lib/problem-link-reminder";
import { TRANSLATION_LINK_OVERRIDE_FIELD } from "@/lib/translation-link-warning";
import { SAME_TRANSLATION_TITLE_OVERRIDE_FIELD } from "@/lib/translation-title-guard";

const initialState: ProblemCreateActionState = { error: null };

type ProblemCreateFormLabels = ConceptLinkReminderLabels & {
  keepSameTranslationTitle: string;
  missingDifficulty: string;
  missingDomain: string;
  missingFieldsHeading: string;
  publishAnyway: string;
  sameTranslationTitleHeading: string;
  sameTranslationTitleWarning: string;
  translationLinksHeading: string;
};

export function ProblemCreateForm({
  children,
  labels,
  requireClassification = false
}: {
  children: ReactNode;
  labels: ProblemCreateFormLabels;
  requireClassification?: boolean;
}) {
  const [state, formAction, pending] = useActionState(createProblemFormAction, initialState);
  const [clientMissing, setClientMissing] = useState<ProblemCreateMissingField[]>([]);
  const missingRef = useRef<HTMLDivElement | null>(null);
  const missingFields = clientMissing.length ? clientMissing : state.errorKind === "missing-fields" ? state.missingFields ?? [] : [];
  const showActionError = Boolean(state.error) && state.errorKind !== "missing-fields";
  const errorRef = useRef<HTMLDivElement | null>(null);
  const reminderRef = useRef<HTMLDivElement | null>(null);
  // Once the server has shown the concept-link reminder, the next submit publishes.
  const [reminded, setReminded] = useState(false);
  const [showReminder, setShowReminder] = useState(false);

  useEffect(() => {
    if (missingFields.length) revealBanner(missingRef.current);
    else if (showActionError) revealBanner(errorRef.current);
  }, [state, clientMissing, missingFields.length, showActionError]);

  useEffect(() => {
    if (!state.conceptLinkReminder) return;
    setReminded(true);
    setShowReminder(true);
  }, [state]);

  useEffect(() => {
    if (showReminder) revealBanner(reminderRef.current);
  }, [showReminder]);

  // Submit through a transition instead of the form action prop so React does not
  // reset the fields when the server answers with the reminder.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    const missing: ProblemCreateMissingField[] = [];
    if (requireClassification) {
      if (!String(data.get("difficulty") ?? "").trim()) missing.push("difficulty");
      if (!data.getAll("domains").some(value => String(value).trim())) missing.push("domain");
    }
    setClientMissing(missing);
    if (missing.length) return;
    setShowReminder(false);
    startTransition(() => formAction(data));
  };

  return (
    <form onSubmit={handleSubmit} className="problem-compose-form" aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {state.sameTranslationTitleConfirmed && (
          <input type="hidden" name={SAME_TRANSLATION_TITLE_OVERRIDE_FIELD} value="confirm" />
        )}
        {reminded && <input type="hidden" name={CONCEPT_LINK_REMINDER_FIELD} value="1" />}
        {showReminder && (
          <ConceptLinkReminder ref={reminderRef} labels={labels} />
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
      </fieldset>
    </form>
  );
}
