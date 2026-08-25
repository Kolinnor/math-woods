type ChatDraftStorage = {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

const MINI_CHAT_DRAFT_PREFIX = "math-woods:mini-chat-draft";

export function miniChatDraftStorageKey(currentUserId: number, recipientId: number) {
  return `${MINI_CHAT_DRAFT_PREFIX}:${currentUserId}:${recipientId}`;
}

export function readMiniChatDraft(
  storage: ChatDraftStorage,
  currentUserId: number,
  recipientId: number
) {
  try {
    return storage.getItem(miniChatDraftStorageKey(currentUserId, recipientId)) ?? "";
  } catch {
    return "";
  }
}

export function writeMiniChatDraft(
  storage: ChatDraftStorage,
  currentUserId: number,
  recipientId: number,
  value: string
) {
  try {
    const key = miniChatDraftStorageKey(currentUserId, recipientId);
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    // A draft should never prevent the chat from working when storage is unavailable.
  }
}
