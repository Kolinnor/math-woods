"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef } from "react";
import {
  createConceptFormAction,
  type ConceptCreateActionState
} from "@/lib/actions/concept-actions";
import { TRANSLATION_LINK_OVERRIDE_FIELD } from "@/lib/translation-link-warning";

const initialState: ConceptCreateActionState = { error: null };

export function ConceptCreateForm({ children }: { children: ReactNode }) {
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
      {state.error && (
        <div ref={errorRef} className="quality-banner translation-link-warning" role="alert" tabIndex={-1}>
          <strong>Translation links need attention.</strong>
          <p>{state.error}</p>
          <button
            type="submit"
            name={TRANSLATION_LINK_OVERRIDE_FIELD}
            value="confirm"
            className="secondary"
          >
            Publish anyway
          </button>
        </div>
      )}
      {children}
    </form>
  );
}
