"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import {
  createChatMessageAction,
  type ChatMessageActionState
} from "@/lib/actions/social-actions";

type ChatMessageFormProps = {
  editorDraftKey: string;
  editorResetSignal: number;
  labels: {
    message: string;
    send: string;
    sending: string;
  };
  otherUsername: string;
};

const initialState: ChatMessageActionState = { error: null };

function SubmitButton({ labels }: { labels: ChatMessageFormProps["labels"] }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? labels.sending : labels.send}
    </button>
  );
}

export function ChatMessageForm({
  editorDraftKey,
  editorResetSignal,
  labels,
  otherUsername
}: ChatMessageFormProps) {
  const [state, formAction] = useActionState(
    createChatMessageAction.bind(null, otherUsername),
    initialState
  );

  return (
    <form action={formAction} className="panel mt-5 grid gap-3 p-5">
      <h2 className="font-semibold">{labels.message}</h2>
      <LazyMarkdownEditor
        name="bodyMarkdown"
        minHeight="9rem"
        lineNumbers={false}
        draftKey={editorDraftKey}
        resetSignal={editorResetSignal}
      />
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <SubmitButton labels={labels} />
    </form>
  );
}
