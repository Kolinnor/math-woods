"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MarkdownBlock } from "@/components/MarkdownBlock";

export type LiveChatMessage = {
  id: number;
  authorId: number;
  authorUsername: string;
  authorName: string;
  bodyHtml: string;
  createdAt: string;
};

type LiveChatThreadProps = {
  currentUserId: number;
  otherUsername: string;
  initialMessages: LiveChatMessage[];
};

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function LiveChatThread({ currentUserId, otherUsername, initialMessages }: LiveChatThreadProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState<"live" | "checking" | "paused">("live");
  const latestIdRef = useRef(initialMessages.at(-1)?.id ?? 0);
  const threadRef = useRef<HTMLElement | null>(null);

  const scrollToEnd = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, []);

  useEffect(() => {
    latestIdRef.current = messages.at(-1)?.id ?? 0;
  }, [messages]);

  useEffect(() => {
    scrollToEnd();
  }, [scrollToEnd]);

  useEffect(() => {
    const controller = new AbortController();
    let stopped = false;
    let timeoutId: number | undefined;

    async function refresh() {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        timeoutId = window.setTimeout(refresh, 8000);
        return;
      }

      setStatus("checking");
      try {
        const response = await fetch(
          `/api/chat/${encodeURIComponent(otherUsername)}/messages?afterId=${latestIdRef.current}`,
          {
            cache: "no-store",
            signal: controller.signal
          }
        );

        if (!response.ok) {
          setStatus("paused");
        } else {
          const data = (await response.json()) as { messages?: LiveChatMessage[] };
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages((current) => {
              const seen = new Set(current.map((message) => message.id));
              return [...current, ...data.messages!.filter((message) => !seen.has(message.id))];
            });
            window.setTimeout(scrollToEnd, 0);
          }
          setStatus("live");
        }
      } catch (error) {
        if (!controller.signal.aborted) setStatus("paused");
      }

      if (!stopped) timeoutId = window.setTimeout(refresh, 3000);
    }

    timeoutId = window.setTimeout(refresh, 3000);

    return () => {
      stopped = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [otherUsername, scrollToEnd]);

  return (
    <section className="chat-thread panel p-5" ref={threadRef}>
      <div className="chat-live-status" aria-live="polite">
        <span className={status === "paused" ? "friend-offline-dot" : "friend-online-dot"} aria-hidden="true" />
        <span>{status === "paused" ? "Live updates paused" : "Live"}</span>
      </div>
      {messages.map((message) => {
        const ownMessage = message.authorId === currentUserId;
        return (
          <article key={message.id} className={ownMessage ? "chat-message chat-message-own" : "chat-message"}>
            <p className="meta">
              <Link href={`/profile/${message.authorUsername}`}>{message.authorName}</Link>
              {" \u00b7 "}
              {formatMessageTime(message.createdAt)}
            </p>
            <MarkdownBlock html={message.bodyHtml} />
          </article>
        );
      })}
      {messages.length === 0 && <p className="muted">No messages yet.</p>}
    </section>
  );
}
