"use client";

import { ArrowDown } from "lucide-react";

type ChatScrollToBottomButtonProps = {
  newMessageLabel: string;
  newMessages: number;
  onClick: () => void;
  scrollLabel: string;
};

export function ChatScrollToBottomButton({
  newMessageLabel,
  newMessages,
  onClick,
  scrollLabel
}: ChatScrollToBottomButtonProps) {
  const label = newMessages > 0 ? `${newMessages} ${newMessageLabel}` : scrollLabel;

  return (
    <button
      type="button"
      className="chat-scroll-to-bottom icon-button"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <ArrowDown size={18} aria-hidden="true" />
      {newMessages > 0 && <span aria-hidden="true">{newMessages > 99 ? "99+" : newMessages}</span>}
    </button>
  );
}
