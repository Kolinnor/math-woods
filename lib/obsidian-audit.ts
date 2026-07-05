export type ObsidianAuditStatus = "publish" | "stub" | "private" | "discard" | "review";

export type ObsidianAuditInput = {
  path: string;
  text: string;
};

export type ObsidianAuditNote = {
  path: string;
  title: string;
  aliases: string[];
  tags: string[];
  links: string[];
  resolvedLinks: string[];
  unresolvedLinks: string[];
  backlinks: string[];
  status: ObsidianAuditStatus;
  reasons: string[];
  warnings: string[];
  wordCount: number;
};

export type ObsidianAuditSummary = {
  totalNotes: number;
  publish: number;
  stub: number;
  private: number;
  discard: number;
  review: number;
  links: number;
  unresolvedLinks: number;
  warnings: number;
};

export type ObsidianAuditResult = {
  generatedAt: string;
  summary: ObsidianAuditSummary;
  notes: ObsidianAuditNote[];
};

type ParsedNote = {
  path: string;
  title: string;
  aliases: string[];
  tags: string[];
  links: string[];
  status: ObsidianAuditStatus | null;
  reasons: string[];
  warnings: string[];
  wordCount: number;
};

const DISCARD_MARKERS = ["trash", "archive", "templates", "template"];
const PRIVATE_MARKERS = ["private", "personal", "journal", "diary", "daily", "dailies", "people"];
const REVIEW_MARKERS = ["inbox", "draft", "drafts", "todo", "wip"];
const PUBLISH_MARKERS = ["publish", "public", "mathwoods", "math-woods"];

export function auditObsidianNotes(inputs: ObsidianAuditInput[], generatedAt = new Date().toISOString()): ObsidianAuditResult {
  const parsed = inputs
    .filter((input) => input.path.toLowerCase().endsWith(".md"))
    .map(parseNote)
    .sort((a, b) => a.path.localeCompare(b.path));
  const aliases = buildAliasMap(parsed);
  const backlinks = new Map<string, Set<string>>();

  for (const note of parsed) {
    for (const target of note.links) {
      const resolved = resolveTarget(target, aliases);
      if (!resolved) continue;
      if (!backlinks.has(resolved)) backlinks.set(resolved, new Set());
      backlinks.get(resolved)!.add(note.path);
    }
  }

  const notes = parsed.map((note) => {
    const resolvedLinks: string[] = [];
    const unresolvedLinks: string[] = [];

    for (const target of note.links) {
      const resolved = resolveTarget(target, aliases);
      if (resolved) resolvedLinks.push(resolved);
      else unresolvedLinks.push(target);
    }

    const noteBacklinks = Array.from(backlinks.get(note.path) ?? []).sort((a, b) => a.localeCompare(b));
    const status = note.status ?? (resolvedLinks.length || noteBacklinks.length ? "stub" : "review");
    const reasons = [...note.reasons];
    if (!note.status && status === "stub") reasons.push("Connected note kept as a stub.");
    if (!note.status && status === "review") reasons.push("Unconnected note needs manual review.");

    return {
      path: note.path,
      title: note.title,
      aliases: note.aliases,
      tags: note.tags,
      links: note.links,
      resolvedLinks: uniqueSorted(resolvedLinks),
      unresolvedLinks: uniqueSorted(unresolvedLinks),
      backlinks: noteBacklinks,
      status,
      reasons,
      warnings: note.warnings,
      wordCount: note.wordCount
    } satisfies ObsidianAuditNote;
  });

  return {
    generatedAt,
    summary: summarize(notes),
    notes
  };
}

export function obsidianAuditToCsv(notes: ObsidianAuditNote[]) {
  return [
    ["status", "path", "title", "tags", "links", "backlinks", "unresolvedLinks", "warnings", "reasons"].join(","),
    ...notes.map((note) =>
      [
        note.status,
        note.path,
        note.title,
        note.tags.join(" "),
        String(note.resolvedLinks.length),
        String(note.backlinks.length),
        String(note.unresolvedLinks.length),
        note.warnings.join("; "),
        note.reasons.join("; ")
      ]
        .map(csvCell)
        .join(",")
    )
  ].join("\n");
}

export function obsidianEdgesToCsv(notes: ObsidianAuditNote[]) {
  const rows = [["source", "target", "resolved", "targetStatus"].join(",")];
  const statusByPath = new Map(notes.map((note) => [note.path, note.status]));

  for (const note of notes) {
    for (const target of note.resolvedLinks) {
      rows.push([note.path, target, "true", statusByPath.get(target) ?? "review"].map(csvCell).join(","));
    }
    for (const target of note.unresolvedLinks) {
      rows.push([note.path, target, "false", ""].map(csvCell).join(","));
    }
  }

  return rows.join("\n");
}

function parseNote(input: ObsidianAuditInput): ParsedNote {
  const normalizedPath = normalizePath(input.path);
  const parsed = parseFrontmatter(input.text);
  const body = parsed.body;
  const tags = uniqueSorted([...frontmatterArray(parsed.attributes.tags), ...inlineTags(input.text)]);
  const aliases = uniqueSorted(frontmatterArray(parsed.attributes.aliases).concat(frontmatterArray(parsed.attributes.alias)));
  const title = frontmatterString(parsed.attributes.title) || firstHeading(body) || titleFromPath(normalizedPath);
  const markers = markerText(normalizedPath, tags, parsed.attributes);
  const warnings = privacyWarnings(input.text, normalizedPath, tags);
  const reasons: string[] = [];
  let status: ObsidianAuditStatus | null = null;

  if (hasMarker(markers, DISCARD_MARKERS)) {
    status = "discard";
    reasons.push("Matched discard markers such as archive, trash, or template.");
  } else if (frontmatterBoolean(parsed.attributes.private) || frontmatterBoolean(parsed.attributes.personal) || hasMarker(markers, PRIVATE_MARKERS)) {
    status = "private";
    reasons.push("Matched private markers such as private, journal, daily, or people.");
  } else if (frontmatterBoolean(parsed.attributes.publish) || frontmatterBoolean(parsed.attributes.public) || hasMarker(markers, PUBLISH_MARKERS)) {
    status = warnings.length ? "review" : "publish";
    reasons.push(warnings.length ? "Explicitly marked for publication but contains warnings." : "Explicitly marked for publication.");
  } else if (frontmatterBoolean(parsed.attributes.publish) === false || frontmatterBoolean(parsed.attributes.public) === false) {
    status = "private";
    reasons.push("Frontmatter disables publication.");
  } else if (hasMarker(markers, REVIEW_MARKERS) || warnings.length) {
    status = "review";
    reasons.push("Matched draft/inbox markers or contains publication warnings.");
  }

  return {
    path: normalizedPath,
    title,
    aliases,
    tags,
    links: uniqueSorted(wikilinks(input.text)),
    status,
    reasons,
    warnings,
    wordCount: wordCount(body)
  };
}

function parseFrontmatter(text: string) {
  if (!text.startsWith("---")) return { attributes: {} as Record<string, string>, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { attributes: {} as Record<string, string>, body: text };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + "\n---".length).replace(/^\r?\n/, "");
  const attributes: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    attributes[match[1]] = match[2].trim();
  }

  return { attributes, body };
}

function frontmatterString(value: string | undefined) {
  if (!value) return "";
  return value.replace(/^["']|["']$/g, "").trim();
}

function frontmatterBoolean(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = frontmatterString(value).toLowerCase();
  if (["true", "yes", "1", "on"].includes(normalized)) return true;
  if (["false", "no", "0", "off"].includes(normalized)) return false;
  return null;
}

function frontmatterArray(value: string | undefined) {
  if (!value) return [];
  const trimmed = value.trim();
  const arrayBody = trimmed.match(/^\[(.*)\]$/)?.[1];
  const source = arrayBody ?? trimmed;

  return source
    .split(",")
    .map((item) => item.replace(/^["'\s]+|["'\s]+$/g, ""))
    .filter(Boolean);
}

function inlineTags(text: string) {
  const tags: string[] = [];
  const pattern = /(^|[\s([{])#([A-Za-z0-9][A-Za-z0-9/_-]*)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    tags.push(match[2].toLowerCase());
  }

  return tags;
}

function wikilinks(text: string) {
  const links: string[] = [];
  const pattern = /!?\[\[([^\]\n]+)\]\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const target = normalizeTarget(match[1]);
    if (target) links.push(target);
  }

  return links;
}

function privacyWarnings(text: string, path: string, tags: string[]) {
  const warnings: string[] = [];
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) warnings.push("Contains an email-like string.");
  if (/(^|[^0-9])(?:\+?\d[\d .-]{7,}\d)([^0-9]|$)/.test(text)) warnings.push("Contains a phone-like number.");
  if (/\b(TODO|FIXME|XXX)\b/i.test(text) || tags.includes("todo")) warnings.push("Contains TODO/FIXME markers.");
  if (/!\[\[[^\]]+\]\]/.test(text)) warnings.push("Contains embedded attachments.");
  if (hasMarker(markerText(path, tags, {}), REVIEW_MARKERS)) warnings.push("Path or tags look like draft/inbox material.");
  return uniqueSorted(warnings);
}

function buildAliasMap(notes: ParsedNote[]) {
  const map = new Map<string, string>();

  for (const note of notes) {
    for (const key of noteKeys(note)) {
      if (!map.has(key)) map.set(key, note.path);
    }
  }

  return map;
}

function noteKeys(note: ParsedNote) {
  return uniqueSorted([
    normalizeLookupKey(note.path.replace(/\.md$/i, "")),
    normalizeLookupKey(titleFromPath(note.path)),
    normalizeLookupKey(note.title),
    ...note.aliases.map(normalizeLookupKey)
  ]).filter(Boolean);
}

function resolveTarget(target: string, aliases: Map<string, string>) {
  const exact = aliases.get(normalizeLookupKey(target));
  if (exact) return exact;
  return aliases.get(normalizeLookupKey(titleFromPath(target))) ?? null;
}

function markerText(path: string, tags: string[], attributes: Record<string, string | undefined>) {
  return [
    path,
    ...tags,
    frontmatterString(attributes.status),
    frontmatterString(attributes.visibility),
    frontmatterString(attributes.type)
  ]
    .join(" ")
    .toLowerCase();
}

function hasMarker(text: string, markers: string[]) {
  return markers.some((marker) => new RegExp(`(^|[/_\\-\\s#])${escapeRegExp(marker)}($|[/_\\-\\s#])`, "i").test(text));
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function normalizeTarget(raw: string) {
  return raw
    .split("|")[0]
    .split("#")[0]
    .trim()
    .replace(/\.md$/i, "")
    .replace(/\\/g, "/");
}

function normalizeLookupKey(raw: string) {
  return normalizeTarget(raw).toLowerCase();
}

function titleFromPath(path: string) {
  const clean = path.replace(/\.md$/i, "");
  const parts = clean.split("/");
  return parts[parts.length - 1] || clean;
}

function firstHeading(markdown: string) {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
}

function wordCount(markdown: string) {
  return markdown.split(/\s+/).filter(Boolean).length;
}

function summarize(notes: ObsidianAuditNote[]): ObsidianAuditSummary {
  const summary: ObsidianAuditSummary = {
    totalNotes: notes.length,
    publish: 0,
    stub: 0,
    private: 0,
    discard: 0,
    review: 0,
    links: 0,
    unresolvedLinks: 0,
    warnings: 0
  };

  for (const note of notes) {
    summary[note.status] += 1;
    summary.links += note.links.length;
    summary.unresolvedLinks += note.unresolvedLinks.length;
    summary.warnings += note.warnings.length;
  }

  return summary;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
