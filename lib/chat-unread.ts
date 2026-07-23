export const CHAT_READ_EVENT = "math-woods:chat-read";

const UNREAD_TITLE_PREFIX = /^\((?:\d+|99\+)\)\s+/;

export function chatUnreadDocumentTitle(title: string, unreadCount: number) {
  const baseTitle = title.replace(UNREAD_TITLE_PREFIX, "");
  if (unreadCount <= 0) return baseTitle;

  const countLabel = unreadCount > 99 ? "99+" : String(unreadCount);
  return `(${countLabel}) ${baseTitle}`;
}
