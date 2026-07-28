export const DEFAULT_AVATAR_PRESETS = [
  "anteater",
  "bat",
  "beetle",
  "chameleon",
  "duck",
  "elk",
  "frog",
  "husky",
  "monkey",
  "mouse",
  "owl",
  "raccoon",
  "snake",
  "squirrel",
  "toucan"
] as const;

export const AVATAR_BACKGROUND_OPTIONS = [
  { id: "moss", color: "#dce9dc" },
  { id: "butter", color: "#f5e8b8" },
  { id: "rose", color: "#f2d9d5" },
  { id: "sky", color: "#dbe8ef" },
  { id: "lavender", color: "#e5dff0" },
  { id: "apricot", color: "#f3dfc9" },
  { id: "mint", color: "#d7ece5" },
  { id: "stone", color: "#e7e3da" }
] as const;

export type AvatarBackgroundId = (typeof AVATAR_BACKGROUND_OPTIONS)[number]["id"];

function stableUsernameHash(username: string) {
  let hash = 2166136261;
  for (const character of username.toLocaleLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function defaultAvatarPresetForUsername(username: string) {
  return DEFAULT_AVATAR_PRESETS[stableUsernameHash(username) % DEFAULT_AVATAR_PRESETS.length];
}

export function defaultAvatarBackgroundForUsername(username: string) {
  return AVATAR_BACKGROUND_OPTIONS[stableUsernameHash(`${username}:background`) % AVATAR_BACKGROUND_OPTIONS.length];
}

export function parseAvatarBackground(value: unknown): AvatarBackgroundId | null {
  if (typeof value !== "string") return null;
  return AVATAR_BACKGROUND_OPTIONS.some((option) => option.id === value)
    ? value as AvatarBackgroundId
    : null;
}

export function avatarBackgroundOption(username: string, selected?: string | null) {
  const parsed = parseAvatarBackground(selected);
  return parsed
    ? AVATAR_BACKGROUND_OPTIONS.find((option) => option.id === parsed) ?? defaultAvatarBackgroundForUsername(username)
    : defaultAvatarBackgroundForUsername(username);
}
