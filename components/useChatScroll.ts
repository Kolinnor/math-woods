"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { chatIsNearBottom } from "@/lib/chat-scroll";

export function useChatScroll(threadRef: RefObject<HTMLElement | null>, activeKey: unknown = true) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesBelow, setNewMessagesBelow] = useState(0);
  const isAtBottomRef = useRef(true);

  const setBottomState = useCallback((next: boolean) => {
    isAtBottomRef.current = next;
    setIsAtBottom(next);
    if (next) setNewMessagesBelow(0);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight, behavior });
    setBottomState(true);
  }, [setBottomState, threadRef]);

  const resetScroll = useCallback(() => {
    setNewMessagesBelow(0);
    setBottomState(true);
    window.requestAnimationFrame(() => scrollToBottom("auto"));
  }, [scrollToBottom, setBottomState]);

  const noteNewMessages = useCallback((count: number, forceFollow = false) => {
    if (forceFollow || isAtBottomRef.current) {
      window.requestAnimationFrame(() => scrollToBottom(forceFollow ? "smooth" : "auto"));
      return;
    }
    if (count > 0) setNewMessagesBelow((current) => current + count);
  }, [scrollToBottom]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;

    function updatePosition() {
      if (!thread) return;
      setBottomState(chatIsNearBottom(thread));
    }

    thread.addEventListener("scroll", updatePosition, { passive: true });
    scrollToBottom("auto");
    return () => thread.removeEventListener("scroll", updatePosition);
  }, [activeKey, scrollToBottom, setBottomState, threadRef]);

  return {
    isAtBottom,
    newMessagesBelow,
    noteNewMessages,
    resetScroll,
    scrollToBottom
  };
}
