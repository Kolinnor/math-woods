"use client";

import type { InputHTMLAttributes } from "react";
import { useEffect, useRef, useState } from "react";
import { clearAcknowledgedEditorDrafts, markEditorDraftSubmission } from "@/lib/editor-draft-receipts";

const DRAFT_PREFIX = "math-woods-text-field-draft";
const DRAFT_SUBMIT_PREFIX = `${DRAFT_PREFIX}:submit`;

type StoredTextDraft = {
  value: string;
  updatedAt: number;
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

function writeStoredValue(key: string, value: StoredTextDraft) {
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
  const [value, setValue] = useState(initialValue);
  const storageKey = `${DRAFT_PREFIX}:${draftKey}`;
  const submitKey = `${DRAFT_SUBMIT_PREFIX}:${storageKey}`;

  useEffect(() => {
    clearAcknowledgedEditorDrafts();
    // Old attempt markers are not proof of a successful save.
    removeStoredValue(submitKey);

    const draft = readStoredValue<StoredTextDraft>(
      storageKey,
      (candidate): candidate is StoredTextDraft =>
        typeof candidate.value === "string" && typeof candidate.updatedAt === "number"
    );
    setValue(draft?.value ?? initialValue);

    const form = inputRef.current?.form;
    const markSubmitted = () => {
      if (form && inputRef.current) markEditorDraftSubmission(form, storageKey, inputRef.current.value);
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
