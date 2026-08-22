"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  createConceptFormAction,
  type ConceptCreateActionState
} from "@/lib/actions/concept-actions";
import { TRANSLATION_LINK_OVERRIDE_FIELD } from "@/lib/translation-link-warning";
import { SAME_TRANSLATION_TITLE_OVERRIDE_FIELD } from "@/lib/translation-title-guard";

const initialState: ConceptCreateActionState = { error: null };

type ConceptCreateFormLabels = {
  duplicateTitleHeading: string;
  duplicateTitleWarning: string;
  keepSameTranslationTitle: string;
  publishing: string;
  publishAnyway: string;
  rateLimitHeading: string;
  rateLimitMessage: string;
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
  const requiresConfirmation = state.errorKind === "same-translation-title" || state.errorKind === "translation-links";
  const errorHeading = state.errorKind === "duplicate-title"
    ? labels.duplicateTitleHeading
    : state.errorKind === "same-translation-title"
      ? labels.sameTranslationTitleHeading
      : state.errorKind === "rate-limit"
        ? labels.rateLimitHeading
        : labels.translationLinksHeading;
  const errorMessage = state.errorKind === "duplicate-title"
    ? labels.duplicateTitleWarning
    : state.errorKind === "same-translation-title"
      ? labels.sameTranslationTitleWarning
      : state.errorKind === "rate-limit"
        ? labels.rateLimitMessage
        : state.error;

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
            {errorHeading}
          </strong>
          <p>{errorMessage}</p>
          {requiresConfirmation && (
            <ConceptSubmitButton
              name={
                state.errorKind === "same-translation-title"
                  ? SAME_TRANSLATION_TITLE_OVERRIDE_FIELD
                  : TRANSLATION_LINK_OVERRIDE_FIELD
              }
              value="confirm"
              className="secondary"
              pendingLabel={labels.publishing}
            >
              {state.errorKind === "same-translation-title"
                ? labels.keepSameTranslationTitle
                : labels.publishAnyway}
            </ConceptSubmitButton>
          )}
        </div>
      )}
      {children}
    </form>
  );
}

export function ConceptSubmitButton({
  children,
  disabled = false,
  pendingLabel,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={disabled || pending} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}
