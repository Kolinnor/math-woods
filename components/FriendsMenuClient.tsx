"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Send } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AutoClosingDetails } from "@/components/AutoClosingDetails";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { chatDayKey, formatChatDay, formatChatTime } from "@/lib/chat-dates";
import type { DirectChatMessage } from "@/lib/direct-chat";
import type { FriendsMenuData } from "@/lib/friends-menu";

const FRIENDS_MENU_POLL_MS = 5000;
const CHAT_POLL_MS = 3000;

type MenuFriend = FriendsMenuData["friends"][number];

export function FriendsMenuClient({ initialData }: { initialData: FriendsMenuData }) {
  const [data, setData] = useState(initialData);
  const [selectedFriend, setSelectedFriend] = useState<MenuFriend | null>(null);
  const [messages, setMessages] = useState<DirectChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const latestMessageIdRef = useRef(0);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let stopped = false;
    let timeoutId: number | undefined;
    let controller: AbortController | null = null;

    async function refresh() {
      controller?.abort();
      controller = new AbortController();

      try {
        const response = await fetch("/api/friends/menu", {
          cache: "no-store",
          signal: controller.signal
        });
        if (response.ok) {
          const nextData = (await response.json()) as FriendsMenuData;
          if (!stopped) setData(nextData);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          // Keep the last known state. The next poll will try again.
        }
      }

      if (!stopped) timeoutId = window.setTimeout(refresh, FRIENDS_MENU_POLL_MS);
    }

    function refreshOnVisible() {
      if (document.visibilityState === "visible") void refresh();
    }

    timeoutId = window.setTimeout(refresh, FRIENDS_MENU_POLL_MS);
    document.addEventListener("visibilitychange", refreshOnVisible);

    return () => {
      stopped = true;
      controller?.abort();
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", refreshOnVisible);
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
    setMessages([]);
    setDraft("");
    setChatError(null);
    setChatLoading(true);

    async function refresh(initial = false) {
      try {
        const afterId = initial ? 0 : latestMessageIdRef.current;
        const response = await fetch(
          `/api/chat/${encodeURIComponent(selectedFriend!.username)}/messages?afterId=${afterId}`,
          { cache: "no-store", signal: controller.signal }
        );
        const result = await response.json() as { error?: string; messages?: DirectChatMessage[] };
        if (!response.ok) throw new Error(result.error || "Conversation could not be loaded.");

        if (!stopped && Array.isArray(result.messages) && result.messages.length > 0) {
          setMessages((current) => {
            const seen = new Set(current.map((message) => message.id));
            return [...current, ...result.messages!.filter((message) => !seen.has(message.id))];
          });
          latestMessageIdRef.current = result.messages.at(-1)?.id ?? latestMessageIdRef.current;
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
      const response = await fetch(`/api/chat/${encodeURIComponent(selectedFriend.username)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyMarkdown: draft })
      });
      const result = await response.json() as { error?: string; message?: DirectChatMessage };
      if (!response.ok || !result.message) throw new Error(result.error || "Message could not be sent.");
      setMessages((current) => current.some((message) => message.id === result.message!.id)
        ? current
        : [...current, result.message!]);
      latestMessageIdRef.current = Math.max(latestMessageIdRef.current, result.message.id);
      setDraft("");
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setChatSending(false);
    }
  }

  function submitOnShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
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
                <strong>{selectedFriend.name}</strong>
                <span><i className={selectedFriend.online ? "friend-online-dot" : "friend-offline-dot"} aria-hidden="true" />{selectedFriend.online ? data.labels.online : data.labels.offline}</span>
              </div>
              <Link
                href={`/chat/${selectedFriend.username}` as never}
                className="icon-button secondary"
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
                    >
                      <MarkdownBlock html={message.bodyHtml} />
                      <time className="friends-mini-message-time" dateTime={message.createdAt}>
                        {formatChatTime(message.createdAt, data.locale, data.timeZone)}
                      </time>
                    </article>
                  </Fragment>
                );
              })}
            </div>

            {chatError && <p className="friends-mini-chat-error" role="alert">{chatError}</p>}
            <form className="friends-mini-chat-composer" onSubmit={sendMessage}>
              <textarea
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
                  <span className={friend.online ? "friend-online-dot" : "friend-offline-dot"} aria-hidden="true" />
                  <span>{friend.name}</span>
                  <small>{friend.online ? data.labels.online : data.labels.offline}</small>
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
