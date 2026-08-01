"use client";

import { useActionState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { shouldSendChatOnEnter } from "@/lib/chat-compose";
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

  function submitOnEnter(event: KeyboardEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".cm-editor")) return;
    if (!shouldSendChatOnEnter({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.nativeEvent.keyCode
    })) return;

    event.preventDefault();
    const form = event.currentTarget;
    const messageField = form.elements.namedItem("bodyMarkdown");
    const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!(messageField instanceof HTMLTextAreaElement) || !messageField.value.trim() || submitButton?.disabled) return;
    form.requestSubmit();
  }

  return (
    <form action={formAction} className="panel mt-5 grid gap-3 p-5" onKeyDownCapture={submitOnEnter}>
      <h2 className="font-semibold">{labels.message}</h2>
      <LazyMarkdownEditor
        name="bodyMarkdown"
        minHeight="9rem"
        lineNumbers={false}
        draftKey={editorDraftKey}
        resetSignal={editorResetSignal}
        imageUploadEnabled={false}
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
