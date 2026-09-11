import { sanitizeReportPath } from "./security.ts";

// Error objects from another window or an injected script may fail instanceof Error.
export function clientErrorDetails(reason: unknown): { message: string; stack: string | null } {
  try {
    if (reason && typeof reason === "object") {
      const value = reason as { message?: unknown; stack?: unknown };
      if (typeof value.message === "string") {
        return { message: value.message, stack: typeof value.stack === "string" ? value.stack : null };
      }
    }
    return { message: typeof reason === "string" ? reason : JSON.stringify(reason) ?? String(reason), stack: null };
  } catch {
    return { message: "Unserializable browser error", stack: null };
  }
}

export function clientErrorEventStack(stack: string | null, filename: string, line: number, column: number) {
  if (!filename || !/^https?:\/\//i.test(filename)) return stack;
  const source = sanitizeReportPath(filename, 600);
  if (!source) return stack;
  // Keep the browser's trace, including anonymous frames, and append the location
  // from ErrorEvent. Never put URL tokens or query parameters in this new frame.
  const location = `${source}:${Number.isInteger(line) && line >= 0 ? line : 0}:${Number.isInteger(column) && column >= 0 ? column : 0}`;
  return `${stack?.slice(0, 7000) ?? ""}\n    at browser error event (${location})`.trim();
}
