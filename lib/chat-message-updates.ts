import type { ChatReactionSummary } from "@/lib/chat-reactions";

export type ChatMessageUpdate = {
  messageId: number;
  bodyMarkdown: string;
  bodyHtml: string;
  editedAt: string | null;
  reactions: ChatReactionSummary[];
};

export function applyChatMessageDeletions<T extends { id: number }>(messages: T[], deletedMessageIds: number[]) {
  if (deletedMessageIds.length === 0) return messages;
  const deletedIds = new Set(deletedMessageIds);
  return messages.filter((message) => !deletedIds.has(message.id));
}

export function applyChatMessageUpdates<
  T extends {
    id: number;
    bodyMarkdown: string;
    bodyHtml: string;
    editedAt: string | null;
    reactions: ChatReactionSummary[];
  }
>(messages: T[], updates: ChatMessageUpdate[]) {
  if (updates.length === 0) return messages;
  const updatesByMessageId = new Map(updates.map((update) => [update.messageId, update]));

  return messages.map((message) => {
    const update = updatesByMessageId.get(message.id);
    if (!update) return message;

    return {
      ...message,
      bodyMarkdown: update.bodyMarkdown,
      bodyHtml: update.bodyHtml,
      editedAt: update.editedAt,
      reactions: update.reactions
    };
  });
}
