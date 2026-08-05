export const SITE_PRESENCE_HEARTBEAT_MS = 30_000;
export const SITE_PRESENCE_WINDOW_MS = 90_000;

export function isSitePresenceId(value: string | null | undefined) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function sitePresenceIsActive(lastSeenAt: number, now = Date.now()) {
  return Number.isFinite(lastSeenAt) && lastSeenAt > now - SITE_PRESENCE_WINDOW_MS;
}
