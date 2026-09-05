"use client";

import type { InputHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";

const DRAFT_PREFIX = "math-woods-text-field-draft";
const DRAFT_SUBMIT_PREFIX = `${DRAFT_PREFIX}:submit`;
const DRAFT_SUBMIT_TTL_MS = 10 * 60 * 1000;

type StoredTextDraft = {
  value: string;
  updatedAt: number;
};

type StoredDraftSubmit = {
  signal: string;
  submittedAt: number;
};

type DraftTextInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "name" | "onChange" | "value"
> & {
  draftKey: string;
  initialValue?: string;
  name: string;
  resetSignal: string | number;
};

function readStoredValue<T>(key: string, validate: (value: Partial<T>) => value is T): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<T>;
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function removeStoredValue(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local drafts must never prevent the form from working.
  }
}

function writeStoredValue(key: string, value: StoredTextDraft | StoredDraftSubmit) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local drafts must never prevent the form from working.
  }
}

export function DraftTextInput({
  draftKey,
  initialValue = "",
  name,
  resetSignal,
  ...inputProps
}: DraftTextInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetSignalRef = useRef(String(resetSignal));
  const [value, setValue] = useState(initialValue);
  const storageKey = `${DRAFT_PREFIX}:${draftKey}`;
  const submitKey = `${DRAFT_SUBMIT_PREFIX}:${storageKey}`;

  useEffect(() => {
    const currentSignal = String(resetSignal);
    resetSignalRef.current = currentSignal;
    const submit = readStoredValue<StoredDraftSubmit>(
      submitKey,
      (candidate): candidate is StoredDraftSubmit =>
        typeof candidate.signal === "string" && typeof candidate.submittedAt === "number"
    );
    const freshSubmit = Boolean(submit && Date.now() - submit.submittedAt <= DRAFT_SUBMIT_TTL_MS);

    if (submit && freshSubmit && submit.signal !== currentSignal) {
      removeStoredValue(storageKey);
      removeStoredValue(submitKey);
    } else if (submit && !freshSubmit) {
      removeStoredValue(submitKey);
    }

    const draft = readStoredValue<StoredTextDraft>(
      storageKey,
      (candidate): candidate is StoredTextDraft =>
        typeof candidate.value === "string" && typeof candidate.updatedAt === "number"
    );
    setValue(draft?.value ?? initialValue);

    const form = inputRef.current?.form;
    const markSubmitted = () => {
      writeStoredValue(submitKey, {
        signal: resetSignalRef.current,
        submittedAt: Date.now()
      });
    };
    form?.addEventListener("submit", markSubmitted);
    return () => form?.removeEventListener("submit", markSubmitted);
  }, [initialValue, resetSignal, storageKey, submitKey]);

  return (
    <input
      {...inputProps}
      ref={inputRef}
      name={name}
      value={value}
      onChange={(event) => {
        const nextValue = event.target.value;
        setValue(nextValue);
        if (nextValue === initialValue) {
          removeStoredValue(storageKey);
        } else {
          writeStoredValue(storageKey, { value: nextValue, updatedAt: Date.now() });
        }
      }}
    />
  );
}
