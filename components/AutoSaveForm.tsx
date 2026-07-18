"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type AutoSaveAction = (formData: FormData) => Promise<unknown>;
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function formDataFingerprint(formData: FormData) {
  return JSON.stringify(Array.from(formData.entries()).map(([name, value]) => [
    name,
    typeof value === "string" ? value : `${value.name}:${value.size}:${value.lastModified}`
  ]));
}

export function AutoSaveForm({
  action,
  children,
  className,
  debounceMs = 900,
  id,
  statusClassName = "autosave-status"
}: {
  action: AutoSaveAction;
  children: ReactNode;
  className?: string;
  debounceMs?: number;
  id?: string;
  statusClassName?: string;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  function clearTimer() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  async function saveNow() {
    clearTimer();
    const form = formRef.current;
    if (!form || !form.checkValidity()) return;
    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }

    const formData = new FormData(form);
    const fingerprint = formDataFingerprint(formData);
    if (fingerprint === lastSavedFingerprintRef.current) {
      setSaveState("saved");
      return;
    }

    savingRef.current = true;
    setSaveState("saving");
    try {
      await action(formData);
      lastSavedFingerprintRef.current = fingerprint;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void saveNow();
      }
    }
  }

  function scheduleSave(delay = debounceMs) {
    clearTimer();
    setSaveState("dirty");
    timerRef.current = window.setTimeout(() => void saveNow(), delay);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveNow();
  }

  const statusText = saveState === "saving"
    ? "Saving..."
    : saveState === "saved"
      ? "Saved"
      : saveState === "error"
        ? "Save failed"
        : saveState === "dirty"
          ? "Unsaved"
          : "";

  return (
    <form
      className={className}
      id={id}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) void saveNow();
      }}
      onChange={() => scheduleSave()}
      onInput={() => scheduleSave()}
      onSubmit={handleSubmit}
      ref={formRef}
    >
      {children}
      <span aria-live="polite" className={statusClassName}>{statusText}</span>
    </form>
  );
}
