"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Send, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { ChatMessageEditor, type EditedChatMessage } from "@/components/ChatMessageEditor";
import { ChatMessageAttachment } from "@/components/ChatMessageAttachment";
import { ChatMessageReactions } from "@/components/ChatMessageReactions";
import { ChatReplyComposerPreview, ChatReplyQuote } from "@/components/ChatReplyQuote";
import { ProblemChallengeDialog } from "@/components/ProblemChallengeDialog";
import { UserAvatar } from "@/components/UserAvatar";
import { shouldSendChatOnEnter } from "@/lib/chat-compose";
import {
  applyChatMessageDeletions,
  applyChatMessageUpdates,
  type ChatMessageUpdate
} from "@/lib/chat-message-updates";
import {
  applyChatReactionUpdates,
  type ChatReactionSummary,
  type ChatReactionUpdate
} from "@/lib/chat-reactions";
import { CHAT_READ_EVENT, chatUnreadDocumentTitle } from "@/lib/chat-unread";
import { chatDayKey, formatChatDay, formatChatTime } from "@/lib/chat-dates";
import type { DirectChatMessage } from "@/lib/direct-chat";
import type { ChatReplyPreview } from "@/lib/chat-replies";
import type { FriendsMenuData } from "@/lib/friends-menu";

const FRIENDS_MENU_POLL_MS = 5000;
const CHAT_POLL_MS = 3000;

type MenuFriend = FriendsMenuData["friends"][number];

export function FriendsMenuClient({ initialData }: { initialData: FriendsMenuData }) {
  const [data, setData] = useState(initialData);
  const [selectedFriend, setSelectedFriend] = useState<MenuFriend | null>(null);
  const [messages, setMessages] = useState<DirectChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatReplyPreview | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const latestMessageIdRef = useRef(0);
  const reactionCursorRef = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function updateTitle() {
      const nextTitle = chatUnreadDocumentTitle(document.title, data.unreadChatCount);
      if (document.title !== nextTitle) document.title = nextTitle;
    }

    updateTitle();
    const observer = new MutationObserver(updateTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [data.unreadChatCount]);

  useEffect(() => {
    let stopped = false;
    let timeoutId: number | undefined;
    let controller: AbortController | null = null;

    async function refresh() {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;

      try {
        const response = await fetch("/api/friends/menu", {
          cache: "no-store",
          signal: requestController.signal
        });
        if (response.ok) {
          const nextData = (await response.json()) as FriendsMenuData;
          if (!stopped) setData(nextData);
        }
      } catch (error) {
        if (!requestController.signal.aborted) {
          // Keep the last known state. The next poll will try again.
        }
      }

      if (!stopped && controller === requestController) {
        timeoutId = window.setTimeout(refresh, FRIENDS_MENU_POLL_MS);
      }
    }

    function refreshNow() {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = undefined;
      void refresh();
    }

    function refreshOnVisible() {
      if (document.visibilityState === "visible") refreshNow();
    }

    function refreshAfterChatRead() {
      refreshNow();
    }

    timeoutId = window.setTimeout(refresh, FRIENDS_MENU_POLL_MS);
    document.addEventListener("visibilitychange", refreshOnVisible);
    window.addEventListener(CHAT_READ_EVENT, refreshAfterChatRead);

    return () => {
      stopped = true;
      controller?.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", refreshOnVisible);
      window.removeEventListener(CHAT_READ_EVENT, refreshAfterChatRead);
    };
  }, []);

  useEffect(() => {
    if (!selectedFriend) return;
    const updated = data.friends.find((friend) => friend.id === selectedFriend.id);
    if (!updated) {
      setSelectedFriend(null);
      return;
    }
    if (updated.name !== selectedFriend.name || updated.online !== selectedFriend.online) {
      setSelectedFriend(updated);
    }
  }, [data.friends, selectedFriend]);

  useEffect(() => {
    if (!selectedFriend) return;
    let stopped = false;
    let timeoutId: number | undefined;
    const controller = new AbortController();
    latestMessageIdRef.current = 0;
    reactionCursorRef.current = 0;
    setMessages([]);
    setDraft("");
    setReplyingTo(null);
    setChatError(null);
    setChatLoading(true);

    async function refresh(initial = false) {
      if (document.visibilityState === "hidden") {
        if (!stopped) timeoutId = window.setTimeout(() => void refresh(false), CHAT_POLL_MS);
        return;
      }

      try {
        const afterId = initial ? 0 : latestMessageIdRef.current;
        const response = await fetch(
          `/api/chat/${encodeURIComponent(selectedFriend!.username)}/messages?afterId=${afterId}`
            + `&reactionsAfter=${reactionCursorRef.current}`,
          { cache: "no-store", signal: controller.signal }
        );
        const result = await response.json() as {
          error?: string;
          messages?: DirectChatMessage[];
          deletedMessageIds?: number[];
          messageUpdates?: ChatMessageUpdate[];
          reactionCursor?: number;
          reactionUpdates?: ChatReactionUpdate[];
        };
        if (!response.ok) throw new Error(result.error || "Conversation could not be loaded.");

        if (
          !stopped
          && (
            (Array.isArray(result.messages) && result.messages.length > 0)
            || (Array.isArray(result.deletedMessageIds) && result.deletedMessageIds.length > 0)
            || (Array.isArray(result.messageUpdates) && result.messageUpdates.length > 0)
            || (Array.isArray(result.reactionUpdates) && result.reactionUpdates.length > 0)
          )
        ) {
          setMessages((current) => {
            const seen = new Set(current.map((message) => message.id));
            const withNewMessages = [
              ...current,
              ...(result.messages ?? []).filter((message) => !seen.has(message.id))
            ];
            return applyChatMessageDeletions(
              applyChatReactionUpdates(
                applyChatMessageUpdates(withNewMessages, result.messageUpdates ?? []),
                result.reactionUpdates ?? []
              ),
              result.deletedMessageIds ?? []
            );
          });
          latestMessageIdRef.current = result.messages?.at(-1)?.id ?? latestMessageIdRef.current;
        }
        if (!stopped && typeof result.reactionCursor === "number") {
          reactionCursorRef.current = result.reactionCursor;
        }
        if (!stopped && (initial || (result.messages?.length ?? 0) > 0)) {
          window.dispatchEvent(new Event(CHAT_READ_EVENT));
        }
        if (!stopped) setChatError(null);
      } catch (error) {
        if (!controller.signal.aborted && !stopped) {
          setChatError(error instanceof Error ? error.message : "Conversation could not be loaded.");
        }
      } finally {
        if (!stopped) {
          setChatLoading(false);
          timeoutId = window.setTimeout(() => void refresh(false), CHAT_POLL_MS);
        }
      }
    }

    void refresh(true);
    return () => {
      stopped = true;
      controller.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [selectedFriend?.username]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFriend || !draft.trim() || chatSending) return;
    setChatSending(true);
    setChatError(null);

    try {
      const payload = new FormData(event.currentTarget);
      payload.set("bodyMarkdown", draft);
      if (replyingTo) payload.set("replyToId", String(replyingTo.id));
      const response = await fetch(`/api/chat/${encodeURIComponent(selectedFriend.username)}/messages`, {
        method: "POST",
        body: payload
      });
      const result = await response.json() as { error?: string; message?: DirectChatMessage };
      if (!response.ok || !result.message) throw new Error(result.error || "Message could not be sent.");
      setMessages((current) => current.some((message) => message.id === result.message!.id)
        ? current
        : [...current, result.message!]);
      latestMessageIdRef.current = Math.max(latestMessageIdRef.current, result.message.id);
      setDraft("");
      setReplyingTo(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setChatSending(false);
    }
  }

  function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
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

  function updateMessageReactions(messageId: number, reactions: ChatReactionSummary[]) {
    setMessages((current) => applyChatReactionUpdates(current, [{ messageId, reactions }]));
  }

  function updateMessageContent(update: EditedChatMessage) {
    const { messageId, ...changes } = update;
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, ...changes } : message
    )));
  }

  function deleteMessage(messageId: number) {
    setMessages((current) => applyChatMessageDeletions(current, [messageId]));
    if (replyingTo?.id === messageId) setReplyingTo(null);
  }

  function replyPreviewFor(message: DirectChatMessage): ChatReplyPreview {
    return {
      id: message.id,
      authorId: message.authorId,
      authorName: message.authorName,
      bodyMarkdown: message.bodyMarkdown,
      hasImage: Boolean(message.imageUrl)
    };
  }

  function scrollToMessage(messageId: number) {
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
  }

  return (
    <AutoClosingDetails className="friends-menu">
      <summary aria-label={data.labels.friends} title={data.labels.friends}>
        <span className="friend-online-dot" aria-hidden="true" />
        <span>{data.labels.onlineShort}</span>
        {data.actionCount > 0 && <strong>{Math.min(data.actionCount, 99)}</strong>}
      </summary>
      <div className={selectedFriend ? "friends-menu-popover is-chat-open" : "friends-menu-popover"}>
        {selectedFriend ? (
          <div className="friends-mini-chat">
            <header className="friends-mini-chat-header">
              <button
                type="button"
                className="icon-button secondary"
                onClick={() => setSelectedFriend(null)}
                title={data.labels.backToFriends}
                aria-label={data.labels.backToFriends}
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <Link
                  href={`/profile/${selectedFriend.username}` as never}
                  className="friends-mini-chat-person"
                  onClick={(event) => {
                    setSelectedFriend(null);
                    const details = event.currentTarget.closest("details");
                    if (details) details.open = false;
                  }}
                >
                  <UserAvatar user={{ ...selectedFriend, displayName: selectedFriend.name }} size="sm" />
                  <strong>{selectedFriend.name}</strong>
                </Link>
                <span className={`friends-mini-chat-status ${selectedFriend.online ? "is-online" : "is-offline"}`}>
                  <i className={selectedFriend.online ? "friend-online-dot" : "friend-offline-dot"} aria-hidden="true" />
                  {selectedFriend.online ? data.labels.online : data.labels.offline}
                </span>
              </div>
              <ProblemChallengeDialog
                buttonClassName="secondary"
                iconOnly
                labels={data.labels.challenge}
                recipientName={selectedFriend.name}
                recipientUsername={selectedFriend.username}
              />
              <Link
                href={`/chat/${selectedFriend.username}` as never}
                className="button icon-button secondary"
                title={data.labels.openFullChat}
                aria-label={data.labels.openFullChat}
                onClick={(event) => {
                  setSelectedFriend(null);
                  const details = event.currentTarget.closest("details");
                  if (details) details.open = false;
                }}
              >
                <ExternalLink size={16} />
              </Link>
              <button
                type="button"
                className="icon-button secondary"
                title={data.labels.closeChat}
                aria-label={data.labels.closeChat}
                onClick={(event) => {
                  setSelectedFriend(null);
                  const details = event.currentTarget.closest("details");
                  if (details) details.open = false;
                }}
              >
                <X size={16} />
              </button>
            </header>

            <div className="friends-mini-chat-thread" ref={threadRef} aria-live="polite">
              {!chatLoading && messages.length === 0 && !chatError && <p>{data.labels.noMessagesYet}</p>}
              {messages.map((message, index) => {
                const dayKey = chatDayKey(message.createdAt, data.timeZone);
                const startsNewDay = index === 0
                  || chatDayKey(messages[index - 1].createdAt, data.timeZone) !== dayKey;
                return (
                  <Fragment key={message.id}>
                    {startsNewDay && (
                      <div className="chat-day-separator" role="separator">
                        <time dateTime={dayKey}>{formatChatDay(message.createdAt, data.locale, data.timeZone)}</time>
                      </div>
                    )}
                    <article
                      className={message.authorId === data.currentUserId ? "friends-mini-message is-own" : "friends-mini-message"}
                      data-chat-message-id={message.id}
                    >
                      {message.replyTo && (
                        <ChatReplyQuote
                          replyTo={message.replyTo}
                          imageLabel={data.labels.chatImage}
                          onNavigate={scrollToMessage}
                        />
                      )}
                      <ChatMessageEditor
                        bodyHtml={message.bodyHtml}
                        bodyMarkdown={message.bodyMarkdown}
                        canDelete={message.authorId === data.currentUserId}
                        canEdit={message.authorId === data.currentUserId && Boolean(message.bodyMarkdown)}
                        labels={data.labels}
                        messageId={message.id}
                        onChange={updateMessageContent}
                        onDelete={deleteMessage}
                        onReply={() => setReplyingTo(replyPreviewFor(message))}
                        otherUsername={selectedFriend.username}
                      />
                      <ChatMessageAttachment
                        alt={data.labels.chatImage}
                        height={message.imageHeight}
                        url={message.imageUrl}
                        width={message.imageWidth}
                      />
                      <ChatMessageReactions
                        labels={data.labels.reactions}
                        messageId={message.id}
                        onChange={updateMessageReactions}
                        otherUsername={selectedFriend.username}
                        reactions={message.reactions}
                      />
                      <span className="friends-mini-message-time">
                        <time dateTime={message.createdAt}>
                          {formatChatTime(message.createdAt, data.locale, data.timeZone)}
                        </time>
                        {message.editedAt && <>{" \u00b7 "}{data.labels.edited}</>}
                      </span>
                    </article>
                  </Fragment>
                );
              })}
            </div>

            {chatError && <p className="friends-mini-chat-error" role="alert">{chatError}</p>}
            <form className="friends-mini-chat-composer" onSubmit={sendMessage}>
              {replyingTo && (
                <ChatReplyComposerPreview
                  labels={{
                    cancelReply: data.labels.cancelReply,
                    image: data.labels.chatImage,
                    replyingTo: data.labels.replyingTo
                  }}
                  onCancel={() => setReplyingTo(null)}
                  replyTo={replyingTo}
                />
              )}
              <input type="hidden" name="replyToId" value={replyingTo?.id ?? ""} />
              <textarea
                name="bodyMarkdown"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={submitOnShortcut}
                placeholder={data.labels.writeMessage}
                aria-label={data.labels.writeMessage}
                rows={2}
              />
              <button
                type="submit"
                className="icon-button"
                disabled={chatSending || !draft.trim()}
                title={chatSending ? data.labels.sending : data.labels.send}
                aria-label={chatSending ? data.labels.sending : data.labels.send}
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        ) : (
          <div className="friends-menu-list-view">
            <Link href={"/friends" as never} className="friends-menu-title">
              {data.labels.friends}
            </Link>
            {data.unreadChatCount > 0 && data.labels.unreadMessages && (
              <Link href={"/friends" as never} className="friends-menu-request">
                {data.labels.unreadMessages}
              </Link>
            )}
            <div className="friends-menu-list">
              {data.friends.map((friend) => (
                <button key={friend.id} type="button" className="friends-menu-row" onClick={() => setSelectedFriend(friend)}>
                  <span className="friends-menu-avatar-wrap">
                    <UserAvatar user={{ ...friend, displayName: friend.name }} size="sm" />
                    <i className={friend.online ? "friend-online-dot" : "friend-offline-dot"} aria-hidden="true" />
                  </span>
                  <span>{friend.name}</span>
                  {friend.unreadCount > 0 ? (
                    <small
                      className="friends-menu-unread-count"
                      aria-label={friend.unreadLabel ?? undefined}
                      title={friend.unreadLabel ?? undefined}
                    >
                      {friend.unreadCount > 99 ? "99+" : friend.unreadCount}
                    </small>
                  ) : (
                    <small className={friend.online ? "friend-presence-label is-online" : "friend-presence-label is-offline"}>
                      {friend.online ? data.labels.online : data.labels.offline}
                    </small>
                  )}
                </button>
              ))}
              {data.friends.length === 0 && <p>{data.labels.noFriendsYet}</p>}
            </div>
            {data.incomingCount > 0 && data.labels.pendingRequests && (
              <Link href={"/friends" as never} className="friends-menu-request">
                {data.labels.pendingRequests}
              </Link>
            )}
          </div>
        )}
      </div>
    </AutoClosingDetails>
  );
}
