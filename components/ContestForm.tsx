"use client";

import { Save } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { saveContestFormAction } from "@/lib/actions/contest-actions";

export function ContestForm({ locale, children }: { locale: "fr" | "en"; children: ReactNode }) {
  const [state, submit, pending] = useActionState(saveContestFormAction.bind(null, locale), { error: "" });
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);
  return (
    <form className="contest-admin-form" aria-busy={pending} onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      // Dispatch manually so React does not reset uncontrolled inputs on validation errors.
      const data = new FormData(event.currentTarget);
      startTransition(() => submit(data));
    }}>
      {state.error && <p ref={errorRef} tabIndex={-1} role="alert" className="quality-banner">{state.error}</p>}
      <p className="muted">{locale === "fr"
        ? "Les deux titres, le samedi de début et la récompense sont obligatoires. Les autres champs sont facultatifs ; sans image, l’illustration par défaut sera utilisée."
        : "Both titles, the starting Saturday and the prize are required. Other fields are optional; leaving the image empty uses the default artwork."}</p>
      {children}
      <button type="submit" disabled={pending}><Save size={17} /> {pending
        ? (locale === "fr" ? "Enregistrement…" : "Saving…")
        : (locale === "fr" ? "Enregistrer" : "Save contest")}</button>
    </form>
  );
}
