"use client";

import type { ReactNode } from "react";
import { useActionState, useEffect, useRef } from "react";
import {
  createProblemFormAction,
  type ProblemCreateActionState
} from "@/lib/actions/problem-actions";

const initialState: ProblemCreateActionState = { error: null };

export function ProblemCreateForm({ children }: { children: ReactNode }) {
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
      {state.error && (
        <div ref={errorRef} className="quality-banner quality-needs-work" role="alert" tabIndex={-1}>
          <strong>Translation links need attention.</strong>
          <p>{state.error}</p>
        </div>
      )}
      {children}
    </form>
  );
}
