export const CHAT_IMAGE_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const CHAT_IMAGE_MAX_OUTPUT_BYTES = 1_500_000;
export const CHAT_IMAGE_MAX_DIMENSION = 2_000;
export const CHAT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const CHAT_IMAGE_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

export function chatImageDailyLimitForRole(role: string) {
  if (role === "ADMIN" || role === "OWNER") return Number.POSITIVE_INFINITY;
  if (role === "MODERATOR") return 100;
  return 20;
}

export function chatImageUrl(otherUsername: string, messageId: number, hasImage: boolean) {
  return hasImage
    ? `/api/chat/${encodeURIComponent(otherUsername)}/messages/${messageId}`
    : null;
}
