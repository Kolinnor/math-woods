"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChatMessageEditor, type EditedChatMessage } from "@/components/ChatMessageEditor";
import { ChatMessageAttachment } from "@/components/ChatMessageAttachment";
import { ChatMessageReactions } from "@/components/ChatMessageReactions";
import { ChatScrollToBottomButton } from "@/components/ChatScrollToBottomButton";
import { useChatReply } from "@/components/ChatReplyContext";
import { ChatReplyQuote } from "@/components/ChatReplyQuote";
import { UserAvatar } from "@/components/UserAvatar";
import { useChatScroll } from "@/components/useChatScroll";
import {
  applyChatMessageDeletions,
  applyChatMessageUpdates,
  type ChatMessageUpdate
} from "@/lib/chat-message-updates";
import {
  applyChatReactionUpdates,
  type ChatReactionLabels,
  type ChatReactionSummary,
  type ChatReactionUpdate
} from "@/lib/chat-reactions";
import { CHAT_READ_EVENT } from "@/lib/chat-unread";
import { chatDayKey, formatChatDay, formatChatTime } from "@/lib/chat-dates";
import { chatScrollTopAfterPrepend } from "@/lib/chat-scroll";
import type { DirectChatMessage } from "@/lib/direct-chat";
import type { ChatReplyPreview } from "@/lib/chat-replies";
import type { InterfaceLocale } from "@/lib/i18n/types";

export type LiveChatMessage = DirectChatMessage;

type LiveChatThreadProps = {
  currentUserId: number;
  initialHasOlderMessages: boolean;
  otherUsername: string;
  initialMessages: LiveChatMessage[];
  locale: InterfaceLocale;
  timeZone: string | null;
  labels: {
    live: string;
    livePaused: string;
    scrollToLatestMessages: string;
    newMessagesBelow: string;
    noMessagesYet: string;
    cancel: string;
    confirmDeleteMessage: string;
    deleteMessage: string;
    deletingMessage: string;
    editMessage: string;
    reply: string;
    edited: string;
    saveChanges: string;
    chatImage: string;
    reactions: ChatReactionLabels;
  };
};

export function LiveChatThread({
  currentUserId,
  initialHasOlderMessages,
  otherUsername,
  initialMessages,
  locale,
  timeZone,
  labels
}: LiveChatThreadProps) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasOlderMessages, setHasOlderMessages] = useState(initialHasOlderMessages);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const { setReplyingTo } = useChatReply();
  const [status, setStatus] = useState<"live" | "checking" | "paused">("live");
  const latestIdRef = useRef(initialMessages.at(-1)?.id ?? 0);
  const reactionCursorRef = useRef(0);
  const threadRef = useRef<HTMLElement | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const prependScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const {
    isAtBottom,
    newMessagesBelow,
    noteNewMessages,
    scrollToBottom
  } = useChatScroll(threadRef, otherUsername);

  useEffect(() => {
    latestIdRef.current = messages.at(-1)?.id ?? 0;
  }, [messages]);

  useLayoutEffect(() => {
    const pending = prependScrollRef.current;
    const thread = threadRef.current;
    if (!pending || !thread) return;
    thread.scrollTop = chatScrollTopAfterPrepend(
      pending.scrollTop,
      pending.scrollHeight,
      thread.scrollHeight
    );
    prependScrollRef.current = null;
  }, [messages]);

  const loadOlderMessages = useCallback(async () => {
    const thread = threadRef.current;
    const oldestMessageId = messages.at(0)?.id;
    if (!thread || !oldestMessageId || !hasOlderMessages || loadingOlderMessages) return;

    setLoadingOlderMessages(true);
    try {
      const response = await fetch(
        `/api/chat/${encodeURIComponent(otherUsername)}/messages?beforeId=${oldestMessageId}`,
        { cache: "no-store" }
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        messages?: LiveChatMessage[];
        hasOlderMessages?: boolean;
      };
      const olderMessages = data.messages ?? [];
      setHasOlderMessages(Boolean(data.hasOlderMessages));
      if (olderMessages.length === 0) return;

      prependScrollRef.current = {
        scrollHeight: thread.scrollHeight,
        scrollTop: thread.scrollTop
      };
      setMessages((current) => {
        const seen = new Set(current.map((message) => message.id));
        return [
          ...olderMessages.filter((message) => !seen.has(message.id)),
          ...current
        ];
      });
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [hasOlderMessages, loadingOlderMessages, messages, otherUsername]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;

    function loadMoreNearTop() {
      if (thread && thread.scrollTop <= 96) void loadOlderMessages();
    }

    thread.addEventListener("scroll", loadMoreNearTop, { passive: true });
    return () => thread.removeEventListener("scroll", loadMoreNearTop);
  }, [loadOlderMessages]);

  const updateMessageReactions = useCallback((messageId: number, reactions: ChatReactionSummary[]) => {
    setMessages((current) => applyChatReactionUpdates(current, [{ messageId, reactions }]));
  }, []);
  const updateMessageContent = useCallback((update: EditedChatMessage) => {
    const { messageId, ...changes } = update;
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, ...changes } : message
    )));
  }, []);
  const deleteMessage = useCallback((messageId: number) => {
    setMessages((current) => applyChatMessageDeletions(current, [messageId]));
    setReplyingTo(null);
  }, [setReplyingTo]);

  const scrollToMessage = useCallback((messageId: number) => {
    const message = threadRef.current?.querySelector<HTMLElement>(`[data-chat-message-id="${messageId}"]`);
    if (!message) return;
    message.scrollIntoView({ behavior: "smooth", block: "center" });
    message.classList.remove("is-reply-highlighted");
    window.requestAnimationFrame(() => message.classList.add("is-reply-highlighted"));
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      message.classList.remove("is-reply-highlighted");
      highlightTimerRef.current = null;
    }, 1800);
  }, []);

  function replyPreviewFor(message: LiveChatMessage): ChatReplyPreview {
    return {
      id: message.id,
      authorId: message.authorId,
      authorName: message.authorName,
      bodyMarkdown: message.bodyMarkdown,
      hasImage: Boolean(message.imageUrl)
    };
  }

  useEffect(() => {
    window.dispatchEvent(new Event(CHAT_READ_EVENT));
  }, []);

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
            deletedMessageIds?: number[];
            messageUpdates?: ChatMessageUpdate[];
            reactionCursor?: number;
            reactionUpdates?: ChatReactionUpdate[];
          };
          if (
            (Array.isArray(data.messages) && data.messages.length > 0)
            || (Array.isArray(data.deletedMessageIds) && data.deletedMessageIds.length > 0)
            || (Array.isArray(data.messageUpdates) && data.messageUpdates.length > 0)
            || (Array.isArray(data.reactionUpdates) && data.reactionUpdates.length > 0)
          ) {
            const newMessages = data.messages ?? [];
            setMessages((current) => {
              const seen = new Set(current.map((message) => message.id));
              const withNewMessages = [
                ...current,
                ...(data.messages ?? []).filter((message) => !seen.has(message.id))
              ];
              return applyChatMessageDeletions(
                applyChatReactionUpdates(
                  applyChatMessageUpdates(withNewMessages, data.messageUpdates ?? []),
                  data.reactionUpdates ?? []
                ),
                data.deletedMessageIds ?? []
              );
            });
            if (newMessages.length > 0) {
              noteNewMessages(
                newMessages.filter((message) => message.authorId !== currentUserId).length,
                newMessages.some((message) => message.authorId === currentUserId)
              );
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
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
  }, [currentUserId, noteNewMessages, otherUsername]);

  return (
    <div className="chat-thread-wrap">
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
            <article
              className={ownMessage ? "chat-message chat-message-own" : "chat-message"}
              data-chat-message-id={message.id}
            >
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
                  {message.editedAt && <>{" \u00b7 "}<span>{labels.edited}</span></>}
                </p>
                {message.replyTo && (
                  <ChatReplyQuote
                    replyTo={message.replyTo}
                    imageLabel={labels.chatImage}
                    onNavigate={scrollToMessage}
                  />
                )}
                <ChatMessageEditor
                  bodyHtml={message.bodyHtml}
                  bodyMarkdown={message.bodyMarkdown}
                  canDelete={ownMessage}
                  canEdit={ownMessage && Boolean(message.bodyMarkdown)}
                  labels={labels}
                  messageId={message.id}
                  onChange={updateMessageContent}
                  onDelete={deleteMessage}
                  onReply={() => setReplyingTo(replyPreviewFor(message))}
                  otherUsername={otherUsername}
                />
                <ChatMessageAttachment
                  alt={labels.chatImage}
                  height={message.imageHeight}
                  url={message.imageUrl}
                  width={message.imageWidth}
                />
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
      {!isAtBottom && (
        <ChatScrollToBottomButton
          newMessageLabel={labels.newMessagesBelow}
          newMessages={newMessagesBelow}
          onClick={() => scrollToBottom()}
          scrollLabel={labels.scrollToLatestMessages}
        />
      )}
    </div>
  );
}
