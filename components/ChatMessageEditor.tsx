"use client";

import { Check, Pencil, X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { shouldSendChatOnEnter } from "@/lib/chat-compose";

export type EditedChatMessage = {
  messageId: number;
  bodyMarkdown: string;
  bodyHtml: string;
  editedAt: string | null;
};

type ChatMessageEditorProps = {
  bodyHtml: string;
  bodyMarkdown: string;
  canEdit: boolean;
  labels: {
    cancel: string;
    editMessage: string;
    saveChanges: string;
  };
  messageId: number;
  onChange: (message: EditedChatMessage) => void;
  otherUsername: string;
};

export function ChatMessageEditor({
  bodyHtml,
  bodyMarkdown,
  canEdit,
  labels,
  messageId,
  onChange,
  otherUsername
}: ChatMessageEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bodyMarkdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancelEditing() {
    setDraft(bodyMarkdown);
    setError(null);
    setEditing(false);
  }

  async function saveMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !draft.trim() || draft.trim() === bodyMarkdown.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/chat/${encodeURIComponent(otherUsername)}/messages/${messageId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bodyMarkdown: draft })
        }
      );
      const result = await response.json() as { error?: string; message?: EditedChatMessage };
      if (!response.ok || !result.message) {
        throw new Error(result.error || "Message could not be edited.");
      }
      onChange(result.message);
      setDraft(result.message.bodyMarkdown);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Message could not be edited.");
    } finally {
      setSaving(false);
    }
  }

  function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
      return;
    }
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
    event.currentTarget.form?.requestSubmit();
  }

  if (editing) {
    return (
      <form className="chat-message-edit-form" onSubmit={saveMessage}>
        <textarea
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={submitOnShortcut}
          rows={3}
        />
        {error && <p className="chat-message-edit-error" role="alert">{error}</p>}
        <div className="chat-message-edit-actions">
          <button
            type="button"
            className="icon-button secondary"
            title={labels.cancel}
            aria-label={labels.cancel}
            onClick={cancelEditing}
          >
            <X size={15} />
          </button>
          <button
            type="submit"
            className="icon-button"
            title={labels.saveChanges}
            aria-label={labels.saveChanges}
            disabled={saving || !draft.trim() || draft.trim() === bodyMarkdown.trim()}
          >
            <Check size={15} />
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={canEdit ? "chat-message-content is-editable" : "chat-message-content"}>
      <MarkdownBlock html={bodyHtml} />
      {canEdit && (
        <button
          type="button"
          className="chat-message-edit-button icon-button secondary"
          title={labels.editMessage}
          aria-label={labels.editMessage}
          onClick={() => {
            setDraft(bodyMarkdown);
            setError(null);
            setEditing(true);
          }}
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
}
