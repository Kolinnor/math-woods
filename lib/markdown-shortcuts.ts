export const DEFAULT_MARKDOWN_HEADING_SHORTCUTS = {
  markdownHeadingShortcuts: true,
  markdownHeading1Shortcut: "Shift+1",
  markdownHeading2Shortcut: "Shift+2",
  markdownHeading3Shortcut: "Shift+3",
  markdownHeading4Shortcut: "Shift+4",
  markdownHeading5Shortcut: "Shift+5",
  markdownHeading6Shortcut: "Shift+6"
};

export type MarkdownHeadingShortcutKey =
  | "markdownHeading1Shortcut"
  | "markdownHeading2Shortcut"
  | "markdownHeading3Shortcut"
  | "markdownHeading4Shortcut"
  | "markdownHeading5Shortcut"
  | "markdownHeading6Shortcut";

export type MarkdownHeadingShortcuts = typeof DEFAULT_MARKDOWN_HEADING_SHORTCUTS;

export type KeyboardShortcutEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  code: string;
  key: string;
};

const shortcutAliases: Record<string, string> = {
  cmd: "meta",
  command: "meta",
  control: "ctrl",
  option: "alt",
  return: "enter",
  esc: "escape",
  spacebar: "space"
};

export function sanitizeShortcut(value: FormDataEntryValue | string | null | undefined, fallback: string) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
  return text || fallback;
}

function normalizedShortcutParts(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => shortcutAliases[part] ?? part);
}

function normalizedEventKey(event: KeyboardShortcutEvent) {
  if (/^Digit\d$/.test(event.code)) return event.code.slice(5);
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  return event.key.toLowerCase() === " " ? "space" : event.key.toLowerCase();
}

export function keyboardEventMatchesShortcut(event: KeyboardShortcutEvent, shortcut: string) {
  const parts = normalizedShortcutParts(shortcut);
  if (!parts.length) return false;

  const key = parts.at(-1);
  const modifiers = new Set(parts.slice(0, -1));

  return (
    key === normalizedEventKey(event) &&
    event.shiftKey === modifiers.has("shift") &&
    event.altKey === modifiers.has("alt") &&
    event.ctrlKey === modifiers.has("ctrl") &&
    event.metaKey === modifiers.has("meta")
  );
}

export function markdownHeadingLevelForEvent(event: KeyboardShortcutEvent, shortcuts: MarkdownHeadingShortcuts) {
  if (!shortcuts.markdownHeadingShortcuts) return null;
  const configuredShortcuts = [
    shortcuts.markdownHeading1Shortcut,
    shortcuts.markdownHeading2Shortcut,
    shortcuts.markdownHeading3Shortcut,
    shortcuts.markdownHeading4Shortcut,
    shortcuts.markdownHeading5Shortcut,
    shortcuts.markdownHeading6Shortcut
  ];

  const index = configuredShortcuts.findIndex((shortcut) => keyboardEventMatchesShortcut(event, shortcut));
  return index >= 0 ? index + 1 : null;
}

export function markdownHeadingLineText(lineText: string, level: number) {
  const safeLevel = Math.min(6, Math.max(1, Math.trunc(level)));
  const content = lineText.replace(/^#{1,6}(?:\s+|$)/, "");
  return `${"#".repeat(safeLevel)} ${content}`;
}
