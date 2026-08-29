const SCRIPT_URL_PATTERN = /\b(?:https?|chrome-extension|moz-extension|safari-extension):\/\/[^\s)]+/i;
const BROWSER_EXTENSION_URL_PATTERN = /^(?:chrome-extension|moz-extension|safari-extension):\/\//i;

export function isBrowserExtensionError(input: { stack?: string | null; sourceUrl?: string | null }) {
  if (input.sourceUrl && BROWSER_EXTENSION_URL_PATTERN.test(input.sourceUrl.trim())) return true;

  const firstScriptUrl = input.stack?.match(SCRIPT_URL_PATTERN)?.[0];
  return Boolean(firstScriptUrl && BROWSER_EXTENSION_URL_PATTERN.test(firstScriptUrl));
}

export function isOpaqueWindowScriptError(input: {
  message?: string | null;
  source?: string | null;
  stack?: string | null;
}) {
  return input.source === "window.error"
    && /^script error\.?$/i.test(input.message?.trim() ?? "")
    && !input.stack?.trim();
}
