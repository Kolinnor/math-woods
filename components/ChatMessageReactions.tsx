"use client";

import { SmilePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CHAT_REACTIONS,
  chatReactionEmoji,
  type ChatReaction,
  type ChatReactionLabels,
  type ChatReactionSummary
} from "@/lib/chat-reactions";

type ChatMessageReactionsProps = {
  labels: ChatReactionLabels;
  messageId: number;
  onChange: (messageId: number, reactions: ChatReactionSummary[]) => void;
  otherUsername: string;
  reactions: ChatReactionSummary[];
};

export function ChatMessageReactions({
  labels,
  messageId,
  onChange,
  otherUsername,
  reactions
}: ChatMessageReactionsProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingReaction, setPendingReaction] = useState<ChatReaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && hostRef.current?.contains(target)) return;
      setPickerOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPickerOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [pickerOpen]);

  async function toggleReaction(reaction: ChatReaction) {
    if (pendingReaction) return;
    setPendingReaction(reaction);
    setError(null);

    try {
      const response = await fetch(
        `/api/chat/${encodeURIComponent(otherUsername)}/messages/${messageId}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reaction })
        }
      );
      const result = await response.json() as {
        error?: string;
        reactions?: ChatReactionSummary[];
      };
      if (!response.ok || !Array.isArray(result.reactions)) {
        throw new Error(result.error || "Reaction could not be saved.");
      }
      onChange(messageId, result.reactions);
      setPickerOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reaction could not be saved.");
    } finally {
      setPendingReaction(null);
    }
  }

  return (
    <div className={reactions.length > 0 ? "chat-reactions" : "chat-reactions is-empty"} ref={hostRef}>
      <div className="chat-reaction-row">
        {reactions.map((summary) => {
          const label = labels.reactionNames[summary.reaction];
          return (
            <button
              key={summary.reaction}
              type="button"
              className={summary.reactedByCurrentUser ? "chat-reaction is-selected" : "chat-reaction"}
              aria-label={`${label}: ${summary.count}`}
              aria-pressed={summary.reactedByCurrentUser}
              disabled={pendingReaction !== null}
              title={label}
              onClick={() => void toggleReaction(summary.reaction)}
            >
              <span aria-hidden="true">{chatReactionEmoji(summary.reaction)}</span>
              <strong>{summary.count}</strong>
            </button>
          );
        })}
        <button
          type="button"
          className="chat-reaction-add"
          aria-expanded={pickerOpen}
          aria-label={labels.addReaction}
          title={labels.addReaction}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <SmilePlus size={15} />
        </button>
      </div>

      {pickerOpen && (
        <div className="chat-reaction-picker" role="menu" aria-label={labels.addReaction}>
          {CHAT_REACTIONS.map((option) => {
            const selected = reactions.some(
              (summary) => summary.reaction === option.type && summary.reactedByCurrentUser
            );
            return (
              <button
                key={option.type}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected}
                aria-label={labels.reactionNames[option.type]}
                className={selected ? "is-selected" : undefined}
                disabled={pendingReaction !== null}
                title={labels.reactionNames[option.type]}
                onClick={() => void toggleReaction(option.type)}
              >
                <span aria-hidden="true">{option.emoji}</span>
              </button>
            );
          })}
        </div>
      )}
      {error && <span className="chat-reaction-error" role="alert">{error}</span>}
    </div>
  );
}
