export const CHAT_NEAR_BOTTOM_PX = 72;

export type ChatScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

export function chatDistanceFromBottom({ clientHeight, scrollHeight, scrollTop }: ChatScrollMetrics) {
  return Math.max(0, scrollHeight - clientHeight - scrollTop);
}

export function chatIsNearBottom(metrics: ChatScrollMetrics, threshold = CHAT_NEAR_BOTTOM_PX) {
  return chatDistanceFromBottom(metrics) <= threshold;
}
