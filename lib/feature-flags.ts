export const EXPLORATIONS_ENABLED = false;

export function assertExplorationsEnabled() {
  if (!EXPLORATIONS_ENABLED) {
    throw new Error("Explorations are temporarily unavailable.");
  }
}
