export const CHAT_REACTIONS = [
  { type: "LIKE", emoji: "👍" },
  { type: "HEART", emoji: "❤️" },
  { type: "DISLIKE", emoji: "👎" },
  { type: "SMILE", emoji: "😊" },
  { type: "LAUGH", emoji: "😂" },
  { type: "SURPRISE", emoji: "😮" },
  { type: "SAD", emoji: "😢" },
  { type: "THINKING", emoji: "🤔" },
  { type: "CELEBRATE", emoji: "🎉" },
  { type: "AGREE", emoji: "✅" }
] as const;

export type ChatReaction = (typeof CHAT_REACTIONS)[number]["type"];

export type ChatReactionSummary = {
  reaction: ChatReaction;
  count: number;
  reactedByCurrentUser: boolean;
};

export type ChatReactionLabels = {
  addReaction: string;
  reactionNames: Record<ChatReaction, string>;
};

export type ChatReactionUpdate = {
  messageId: number;
  reactions: ChatReactionSummary[];
};

const CHAT_REACTION_SET = new Set<string>(CHAT_REACTIONS.map((reaction) => reaction.type));

export function isChatReaction(value: unknown): value is ChatReaction {
  return typeof value === "string" && CHAT_REACTION_SET.has(value);
}

export function chatReactionEmoji(reaction: ChatReaction) {
  return CHAT_REACTIONS.find((option) => option.type === reaction)?.emoji ?? "";
}

export function summarizeChatReactions(
  reactions: Array<{ reaction: string; userId: number }>,
  currentUserId: number
): ChatReactionSummary[] {
  const counts = new Map<ChatReaction, number>();
  const selected = new Set<ChatReaction>();

  for (const row of reactions) {
    if (!isChatReaction(row.reaction)) continue;
    counts.set(row.reaction, (counts.get(row.reaction) ?? 0) + 1);
    if (row.userId === currentUserId) selected.add(row.reaction);
  }

  return CHAT_REACTIONS.flatMap(({ type }) => {
    const count = counts.get(type) ?? 0;
    return count > 0
      ? [{ reaction: type, count, reactedByCurrentUser: selected.has(type) }]
      : [];
  });
}

export function applyChatReactionUpdates<T extends { id: number; reactions: ChatReactionSummary[] }>(
  messages: T[],
  updates: ChatReactionUpdate[]
) {
  if (updates.length === 0) return messages;
  const byMessageId = new Map(updates.map((update) => [update.messageId, update.reactions]));
  return messages.map((message) => {
    const reactions = byMessageId.get(message.id);
    return reactions ? { ...message, reactions } : message;
  });
}
