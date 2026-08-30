"use client";

import { Check, Pencil, Reply, Trash2, X } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { shouldSendChatOnEnter } from "@/lib/chat-compose";
import { readJsonResponse } from "@/lib/json-response";

export type EditedChatMessage = {
  messageId: number;
  bodyMarkdown: string;
  bodyHtml: string;
  editedAt: string | null;
};

type ChatMessageEditorProps = {
  bodyHtml: string;
  bodyMarkdown: string;
  canDelete: boolean;
  canEdit: boolean;
  labels: {
    cancel: string;
    confirmDeleteMessage: string;
    deleteMessage: string;
    deleteMessageError: string;
    deletingMessage: string;
    editMessage: string;
    editMessageError: string;
    reply: string;
    saveChanges: string;
  };
  messageId: number;
  onChange: (message: EditedChatMessage) => void;
  onDelete: (messageId: number) => void;
  onReply: () => void;
  otherUsername: string;
};

export function ChatMessageEditor({
  bodyHtml,
  bodyMarkdown,
  canDelete,
  canEdit,
  labels,
  messageId,
  onChange,
  onDelete,
  onReply,
  otherUsername
}: ChatMessageEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bodyMarkdown);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      const result = await readJsonResponse<{ error?: string; message?: EditedChatMessage }>(response);
      if (!response.ok || !result?.message) {
        throw new Error(result?.error || labels.editMessageError);
      }
      onChange(result.message);
      setDraft(result.message.bodyMarkdown);
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : labels.editMessageError);
    } finally {
      setSaving(false);
    }
  }

  async function deleteMessage() {
    if (deleting || !window.confirm(labels.confirmDeleteMessage)) return;
    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/chat/${encodeURIComponent(otherUsername)}/messages/${messageId}`,
        { method: "DELETE" }
      );
      const result = await readJsonResponse<{ error?: string; messageId?: number }>(response);
      if (!response.ok || result?.messageId !== messageId) {
        throw new Error(result?.error || labels.deleteMessageError);
      }
      onDelete(messageId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : labels.deleteMessageError);
      setDeleting(false);
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
    <div className={canDelete ? "chat-message-content has-actions has-edit-action" : "chat-message-content has-actions"}>
      <MarkdownBlock html={bodyHtml} />
      <div className="chat-message-actions">
        <button
          type="button"
          className="chat-message-action-button icon-button secondary"
          title={labels.reply}
          aria-label={labels.reply}
          onClick={onReply}
        >
          <Reply size={13} aria-hidden="true" />
        </button>
        {canDelete && (
          <>
            {canEdit && (
              <button
                type="button"
                className="chat-message-action-button is-owner-action icon-button secondary"
                title={labels.editMessage}
                aria-label={labels.editMessage}
                onClick={() => {
                  setDraft(bodyMarkdown);
                  setError(null);
                  setEditing(true);
                }}
              >
                <Pencil size={11} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="chat-message-action-button is-owner-action icon-button danger"
              title={deleting ? labels.deletingMessage : labels.deleteMessage}
              aria-label={deleting ? labels.deletingMessage : labels.deleteMessage}
              disabled={deleting}
              onClick={() => void deleteMessage()}
            >
              <Trash2 size={11} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      {error && !editing && <p className="chat-message-edit-error" role="alert">{error}</p>}
    </div>
  );
}
