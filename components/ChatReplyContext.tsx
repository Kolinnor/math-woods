"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ChatReplyPreview } from "@/lib/chat-replies";

type ChatReplyContextValue = {
  replyingTo: ChatReplyPreview | null;
  setReplyingTo: (message: ChatReplyPreview | null) => void;
};

const ChatReplyContext = createContext<ChatReplyContextValue | null>(null);

export function ChatReplyProvider({ children }: { children: ReactNode }) {
  const [replyingTo, setReplyingTo] = useState<ChatReplyPreview | null>(null);
  const value = useMemo(() => ({ replyingTo, setReplyingTo }), [replyingTo]);

  return <ChatReplyContext.Provider value={value}>{children}</ChatReplyContext.Provider>;
}

export function useChatReply() {
  const context = useContext(ChatReplyContext);
  if (!context) throw new Error("useChatReply must be used inside ChatReplyProvider.");
  return context;
}
