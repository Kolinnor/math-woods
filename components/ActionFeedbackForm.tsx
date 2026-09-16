"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { FormFeedbackState } from "@/lib/form-feedback";

export function ActionFeedbackForm({ action, children, className }: {
  action: (state: FormFeedbackState, data: FormData) => Promise<FormFeedbackState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, submit, pending] = useActionState(action, { error: "" });
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  return (
    <form className={className} aria-busy={pending} onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      // Preserve uncontrolled editors and fields when the server rejects a submission.
      const data = new FormData(event.currentTarget);
      startTransition(() => submit(data));
    }}>
      {state.error && <p ref={errorRef} tabIndex={-1} role="alert" className="quality-banner">{state.error}</p>}
      <fieldset disabled={pending} className="contents">{children}</fieldset>
    </form>
  );
}
