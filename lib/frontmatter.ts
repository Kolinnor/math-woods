export type FrontmatterValue = string | number | boolean | string[];

export type ParsedMarkdownDocument = {
  attributes: Record<string, FrontmatterValue>;
  body: string;
};

export function parseMarkdownDocument(input: string): ParsedMarkdownDocument {
  const normalized = input.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return { attributes: {}, body: normalized.trimStart() };
  }

  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    return { attributes: {}, body: normalized.trimStart() };
  }

  const rawFrontmatter = normalized.slice(4, end).trim();
  const body = normalized.slice(end + 4).replace(/^\n+/, "");
  const attributes: Record<string, FrontmatterValue> = {};

  for (const line of rawFrontmatter.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf(":");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key) continue;

    attributes[key] = parseFrontmatterValue(rawValue);
  }

  return { attributes, body };
}

export function getStringAttribute(
  attributes: Record<string, FrontmatterValue>,
  key: string
): string | undefined {
  const value = attributes[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

export function getNumberAttribute(
  attributes: Record<string, FrontmatterValue>,
  key: string
): number | undefined {
  const value = attributes[key];
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function getBooleanAttribute(
  attributes: Record<string, FrontmatterValue>,
  key: string
): boolean | undefined {
  const value = attributes[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "no") return false;
  }
  return undefined;
}

export function getStringArrayAttribute(
  attributes: Record<string, FrontmatterValue>,
  key: string
): string[] {
  const value = attributes[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseFrontmatterValue(rawValue: string): FrontmatterValue {
  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    const inner = rawValue.slice(1, -1).trim();
    if (!inner) return [];
    return splitArrayItems(inner).map(unquote);
  }

  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }

  if (rawValue === "true") return true;
  if (rawValue === "false") return false;

  return unquote(rawValue);
}

function splitArrayItems(input: string): string[] {
  const items: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if ((char === '"' || char === "'") && input[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char;
      current += char;
      continue;
    }

    if (char === "," && !quote) {
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) items.push(current.trim());
  return items;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }

  return trimmed;
}
