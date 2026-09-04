export function directChatClearPlan(
  chat: {
    userAId: number;
    userBId: number;
    userACleared: Date | null;
    userBCleared: Date | null;
  },
  userId: number,
  clearedAt: Date
) {
  if (chat.userAId === userId) {
    return {
      data: { userACleared: clearedAt },
      purgeThrough: chat.userBCleared
    };
  }
  if (chat.userBId === userId) {
    return {
      data: { userBCleared: clearedAt },
      purgeThrough: chat.userACleared
    };
  }
  throw new Error("User is not part of this conversation.");
}
