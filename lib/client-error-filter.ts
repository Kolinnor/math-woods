// User-agent identification only affects notifications, never access or report storage.
export function isMetaCrawlerErrorReport(input: { userAgent?: string | null; userId?: number | null }) {
  return input.userId == null
    && /(?:^|[\s;(])(?:meta-externalagent|meta-externalfetcher|facebookexternalhit|facebot)(?:[\s/;)]|$)/i.test(input.userAgent ?? "");
}

export function isMetaCrawlerResourceError(input: { userAgent?: string | null; userId?: number | null; message: string }) {
  return isMetaCrawlerErrorReport(input)
    && /^(?:Loading chunk \d+ failed\.|network error$|Load failed$|Failed to fetch$)/i.test(input.message.trim());
}

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

// These injected Brave iOS scripts are attributed to the page URL, not an
// extension URL. Keep reports for inspection and only silence owner alerts.
export function isKnownInjectedBrowserScriptError(input: {
  userAgent?: string | null; source?: string | null; message: string; stack?: string | null;
}) {
  if (input.source !== "window.error" || !/\bBrave\b/.test(input.userAgent ?? "")
    || !/\b(?:iPhone|iPad|iPod)\b/.test(input.userAgent ?? "")) return false;
  const stack = input.stack ?? "";
  if (!/^global code@https?:\/\/[^\s]+:1:\d+(?:\n|$)/.test(stack) || /\/_next\//.test(stack)) return false;
  return /^(?:ReferenceError: Can't find variable: (?:__firefox__|DarkReader)|TypeError: undefined is not an object \(evaluating 'window\.__firefox__\.(?:reader|refresh_youtube_quality_[A-F0-9]{32})'\)|TypeError: undefined is not an object \(evaluating 'window\.ethereum\.selectedAddress = undefined'\))$/.test(input.message);
}
