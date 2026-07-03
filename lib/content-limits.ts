export const CONTENT_LIMITS = {
  title: 160,
  shortText: 240,
  mediumText: 1200,
  longNote: 4000,
  markdown: 60000,
  discussionPost: 10000,
  importMarkdown: 100000,
  tagList: 1000,
  relationGroups: 12000
} as const;

type TextOptions = {
  trim?: boolean;
};

export function boundedText(
  value: FormDataEntryValue | string | null | undefined,
  maxLength: number,
  label: string,
  options: TextOptions = {}
) {
  const trim = options.trim ?? true;
  const text = String(value ?? "");
  const normalized = trim ? text.trim() : text;

  if (normalized.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength.toLocaleString("en-US")} characters.`);
  }

  return normalized;
}

export function requiredBoundedText(
  value: FormDataEntryValue | string | null | undefined,
  maxLength: number,
  label: string,
  options: TextOptions = {}
) {
  const text = boundedText(value, maxLength, label, options);
  if (!text.trim()) throw new Error(`${label} is required.`);
  return text;
}

export function optionalBoundedText(
  value: FormDataEntryValue | string | null | undefined,
  maxLength: number,
  label: string,
  options: TextOptions = {}
) {
  return boundedText(value, maxLength, label, options) || null;
}
