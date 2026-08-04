"use client";

import { useActionState, type KeyboardEvent } from "react";
import { useFormStatus } from "react-dom";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { useChatReply } from "@/components/ChatReplyContext";
import { ChatReplyComposerPreview } from "@/components/ChatReplyQuote";
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
    cancelReply: string;
    chatImage: string;
    replyingTo: string;
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
  const { replyingTo, setReplyingTo } = useChatReply();
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
    <form action={formAction} className="chat-message-form panel mt-5 grid gap-3 p-5" onKeyDownCapture={submitOnEnter}>
      <h2 className="font-semibold">{labels.message}</h2>
      {replyingTo && (
        <ChatReplyComposerPreview
          labels={{
            cancelReply: labels.cancelReply,
            image: labels.chatImage,
            replyingTo: labels.replyingTo
          }}
          onCancel={() => setReplyingTo(null)}
          replyTo={replyingTo}
        />
      )}
      <input type="hidden" name="replyToId" value={replyingTo?.id ?? ""} />
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
