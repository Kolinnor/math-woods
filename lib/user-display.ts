export const DISPLAY_NAME_MAX_LENGTH = 24;

type DisplayUser = {
  username: string;
  displayName?: string | null;
};

export function normalizeDisplayName(value: FormDataEntryValue | string | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length < 2) throw new Error("Profile name must be at least 2 characters.");
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    throw new Error(`Profile name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`);
  }
  if (/[<>{}]/.test(normalized)) {
    throw new Error("Profile name contains unsupported characters.");
  }
  if (/[\p{Cc}\p{Cf}]/u.test(normalized)) {
    throw new Error("Profile name contains invisible or unsupported characters.");
  }

  return normalized;
}

export function displayNameComparisonKey(displayName: string) {
  return displayName.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function displayNameForUser(user: DisplayUser) {
  const displayName = user.displayName?.trim();
  if (displayName) return displayName;
  return user.username
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
