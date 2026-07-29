"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChatMessageReactions } from "@/components/ChatMessageReactions";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserAvatar } from "@/components/UserAvatar";
import {
  applyChatReactionUpdates,
  type ChatReactionLabels,
  type ChatReactionSummary,
  type ChatReactionUpdate
} from "@/lib/chat-reactions";
import { CHAT_READ_EVENT } from "@/lib/chat-unread";
import { chatDayKey, formatChatDay, formatChatTime } from "@/lib/chat-dates";
import type { DirectChatMessage } from "@/lib/direct-chat";
import type { InterfaceLocale } from "@/lib/i18n/types";

export type LiveChatMessage = DirectChatMessage;

type LiveChatThreadProps = {
  currentUserId: number;
  otherUsername: string;
  initialMessages: LiveChatMessage[];
  locale: InterfaceLocale;
  timeZone: string | null;
  labels: {
    live: string;
    livePaused: string;
    noMessagesYet: string;
    reactions: ChatReactionLabels;
  };
};

export function LiveChatThread({
  currentUserId,
  otherUsername,
  initialMessages,
  locale,
  timeZone,
  labels
}: LiveChatThreadProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState<"live" | "checking" | "paused">("live");
  const latestIdRef = useRef(initialMessages.at(-1)?.id ?? 0);
  const reactionCursorRef = useRef(0);
  const threadRef = useRef<HTMLElement | null>(null);

  const scrollToEnd = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, []);

  useEffect(() => {
    latestIdRef.current = messages.at(-1)?.id ?? 0;
  }, [messages]);

  const updateMessageReactions = useCallback((messageId: number, reactions: ChatReactionSummary[]) => {
    setMessages((current) => applyChatReactionUpdates(current, [{ messageId, reactions }]));
  }, []);

  useEffect(() => {
    scrollToEnd();
    window.dispatchEvent(new Event(CHAT_READ_EVENT));
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
          `/api/chat/${encodeURIComponent(otherUsername)}/messages?afterId=${latestIdRef.current}`
            + `&reactionsAfter=${reactionCursorRef.current}`,
          {
            cache: "no-store",
            signal: controller.signal
          }
        );

        if (!response.ok) {
          setStatus("paused");
        } else {
          const data = (await response.json()) as {
            messages?: LiveChatMessage[];
            reactionCursor?: number;
            reactionUpdates?: ChatReactionUpdate[];
          };
          if (
            (Array.isArray(data.messages) && data.messages.length > 0)
            || (Array.isArray(data.reactionUpdates) && data.reactionUpdates.length > 0)
          ) {
            setMessages((current) => {
              const seen = new Set(current.map((message) => message.id));
              const withNewMessages = [
                ...current,
                ...(data.messages ?? []).filter((message) => !seen.has(message.id))
              ];
              return applyChatReactionUpdates(withNewMessages, data.reactionUpdates ?? []);
            });
            if ((data.messages?.length ?? 0) > 0) {
              window.setTimeout(scrollToEnd, 0);
              window.dispatchEvent(new Event(CHAT_READ_EVENT));
            }
          }
          if (typeof data.reactionCursor === "number") reactionCursorRef.current = data.reactionCursor;
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
        <span>{status === "paused" ? labels.livePaused : labels.live}</span>
      </div>
      {messages.map((message, index) => {
        const ownMessage = message.authorId === currentUserId;
        const dayKey = chatDayKey(message.createdAt, timeZone);
        const startsNewDay = index === 0 || chatDayKey(messages[index - 1].createdAt, timeZone) !== dayKey;
        return (
          <Fragment key={message.id}>
            {startsNewDay && (
              <div className="chat-day-separator" role="separator">
                <time dateTime={dayKey}>{formatChatDay(message.createdAt, locale, timeZone)}</time>
              </div>
            )}
            <article className={ownMessage ? "chat-message chat-message-own" : "chat-message"}>
              <UserAvatar
                user={{
                  username: message.authorUsername,
                  displayName: message.authorName,
                  avatarBackground: message.authorAvatarBackground,
                  avatarUrl: message.authorAvatarUrl
                }}
                size="sm"
              />
              <div>
                <p className="meta">
                  <Link href={`/profile/${message.authorUsername}`}>{message.authorName}</Link>
                  {" \u00b7 "}
                  <time dateTime={message.createdAt}>{formatChatTime(message.createdAt, locale, timeZone)}</time>
                </p>
                <MarkdownBlock html={message.bodyHtml} />
                <ChatMessageReactions
                  labels={labels.reactions}
                  messageId={message.id}
                  onChange={updateMessageReactions}
                  otherUsername={otherUsername}
                  reactions={message.reactions}
                />
              </div>
            </article>
          </Fragment>
        );
      })}
      {messages.length === 0 && <p className="muted">{labels.noMessagesYet}</p>}
    </section>
  );
}
