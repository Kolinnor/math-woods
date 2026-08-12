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
    let animationFrame: number | null = null;
    let disposed = false;

    function keepLatestMessageAnchored() {
      if (!thread || !isAtBottomRef.current) return;
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        if (disposed || !isAtBottomRef.current) return;
        thread.scrollTop = thread.scrollHeight;
        setBottomState(true);
      });
    }

    function updatePosition() {
      if (!thread) return;
      setBottomState(chatIsNearBottom(thread));
    }

    const observedChildren = new Set<Element>();
    const resizeObserver = new ResizeObserver(() => keepLatestMessageAnchored());
    const observeChildren = () => {
      for (const child of Array.from(thread.children)) {
        if (observedChildren.has(child)) continue;
        observedChildren.add(child);
        resizeObserver.observe(child);
      }
    };
    const mutationObserver = new MutationObserver(() => {
      observeChildren();
      keepLatestMessageAnchored();
    });

    thread.addEventListener("scroll", updatePosition, { passive: true });
    setBottomState(true);
    thread.scrollTop = thread.scrollHeight;
    observeChildren();
    mutationObserver.observe(thread, { childList: true });
    keepLatestMessageAnchored();
    void document.fonts?.ready.then(() => keepLatestMessageAnchored());

    return () => {
      disposed = true;
      thread.removeEventListener("scroll", updatePosition);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [activeKey, scrollToBottom, setBottomState, threadRef]);

  return {
    isAtBottom,
    newMessagesBelow,
    noteNewMessages,
    resetScroll,
    scrollToBottom
  };
}
