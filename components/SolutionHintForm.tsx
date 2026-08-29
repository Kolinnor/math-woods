"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import {
  saveSolutionHintAction,
  type SolutionHintActionState
} from "@/lib/actions/proof-actions";
import { CONTENT_LIMITS } from "@/lib/content-limits";

const initialState: SolutionHintActionState = { error: null };

type SolutionHintFormProps = {
  draftKey: string;
  initialValue?: string;
  problemId: number;
  proofId: number;
  resetSignal: number;
  labels: {
    required: string;
    save: string;
    tooLong: string;
  };
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{label}</button>;
}

export function SolutionHintForm({
  draftKey,
  initialValue,
  labels,
  problemId,
  proofId,
  resetSignal
}: SolutionHintFormProps) {
  const [state, formAction] = useActionState(
    saveSolutionHintAction.bind(null, problemId, proofId),
    initialState
  );
  const errorMessage = state.error === "required"
    ? labels.required
    : state.error === "too-long"
      ? labels.tooLong
      : null;

  return (
    <form action={formAction} className="grid gap-3">
      <MarkdownEditor
        name="bodyMarkdown"
        initialValue={initialValue}
        minHeight="8rem"
        lineNumbers={false}
        draftKey={draftKey}
        resetSignal={resetSignal}
        maxLength={CONTENT_LIMITS.discussionPost}
      />
      {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
      <SubmitButton label={labels.save} />
    </form>
  );
}
