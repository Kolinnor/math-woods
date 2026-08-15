export const USER_DISCOVERY_SOURCES = [
  "THREE_BLUE_ONE_BROWN",
  "PHIL",
  "FRIENDS",
  "MATH_COMMUNITY",
  "SOCIAL_MEDIA",
  "SEARCH_ENGINE",
  "OTHER"
] as const;

export type UserDiscoverySource = (typeof USER_DISCOVERY_SOURCES)[number];

const discoverySourceSet = new Set<string>(USER_DISCOVERY_SOURCES);

export function parseUserDiscoverySource(value: unknown): UserDiscoverySource | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  return discoverySourceSet.has(normalized) ? (normalized as UserDiscoverySource) : null;
}
