import { CONTENT_LIMITS } from "./content-limits.ts";

export const GUIDE_LANGUAGES = ["en", "fr"] as const;
export type GuideLanguage = typeof GUIDE_LANGUAGES[number];
export type GuideContent = {
  language: GuideLanguage;
  title: string;
  description: string;
  bodyMarkdown: string;
};
export type GuideSnapshot = Record<GuideLanguage, GuideContent | null>;
export type GuideFiles = Record<GuideLanguage, GuideContent>;

export function normalizeGuideText(text: string) {
  return text.replace(/\r\n?/g, "\n");
}

export function validateGuide(value: unknown, language: GuideLanguage): GuideContent {
  if (!GUIDE_LANGUAGES.includes(language)) throw new Error(`Unsupported guide language: ${language}.`);
  if (!value || typeof value !== "object") throw new Error(`Missing ${language} guide.`);
  const guide = value as Partial<GuideContent>;
  if (guide.language !== language) throw new Error(`Wrong language for ${language} guide.`);
  for (const [key, limit] of [
    ["title", CONTENT_LIMITS.title],
    ["description", CONTENT_LIMITS.longNote],
    ["bodyMarkdown", CONTENT_LIMITS.markdown]
  ] as const) {
    const text = guide[key];
    if (typeof text !== "string" || !text.trim() || text.length > limit) {
      throw new Error(`Invalid ${language} guide ${key} (required, maximum ${limit} characters).`);
    }
  }
  const bodyMarkdown = normalizeGuideText(guide.bodyMarkdown!).replace(/\n+$/, "");
  if (/^(?:<{7}|={7}|>{7}|\|{7})(?: |$)/m.test(bodyMarkdown)) {
    throw new Error(`Unresolved conflict markers in ${language} guide.`);
  }
  return { language, title: normalizeGuideText(guide.title!), description: normalizeGuideText(guide.description!), bodyMarkdown };
}

export function parseGuideMarkdown(source: string, language: GuideLanguage): GuideContent {
  const text = normalizeGuideText(source).replace(/^\uFEFF/, "");
  const match = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`Missing front matter in ${language}.md.`);
  const metadata: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const field = /^(title|description):[ \t]*(.+)$/.exec(line);
    if (!field || Object.hasOwn(metadata, field[1])) {
      throw new Error(`Invalid or duplicate metadata in ${language}.md: ${line}`);
    }
    const raw = field[2].trim();
    let value: unknown = raw;
    if (raw.startsWith('"')) value = JSON.parse(raw);
    else if (raw.startsWith("'")) {
      if (!raw.endsWith("'")) throw new Error(`Unclosed metadata quote in ${language}.md.`);
      value = raw.slice(1, -1).replace(/''/g, "'");
    } else if (/^[>|]/.test(raw)) {
      throw new Error(`Multiline metadata is unsupported in ${language}.md.`);
    }
    if (typeof value !== "string") throw new Error(`Invalid metadata in ${language}.md.`);
    metadata[field[1]] = value;
  }
  return validateGuide({ language, ...metadata, bodyMarkdown: match[2] }, language);
}

export function formatGuideMarkdown(value: GuideContent) {
  const guide = validateGuide(value, value.language);
  return `---\ntitle: ${JSON.stringify(guide.title)}\ndescription: ${JSON.stringify(guide.description)}\n---\n\n${guide.bodyMarkdown}\n`;
}

export function sameGuide(left: GuideContent | null, right: GuideContent | null) {
  if (left === null || right === null) return left === right;
  return formatGuideMarkdown(left) === formatGuideMarkdown(right);
}

export function parseGuideSnapshot(value: unknown): GuideSnapshot {
  if (!value || typeof value !== "object" || (value as { version?: number }).version !== 1) {
    throw new Error("Unsupported guide snapshot. Run guides:pull before deployment.");
  }
  const site = (value as { site?: Record<string, unknown> }).site;
  if (!site) throw new Error("Missing site snapshot.");
  return Object.fromEntries(GUIDE_LANGUAGES.map((language) => [
    language, site[language] === null ? null : validateGuide(site[language], language)
  ])) as GuideSnapshot;
}

export function guideImportPlan(repository: GuideFiles, expected: GuideSnapshot, current: GuideSnapshot) {
  const conflicts = GUIDE_LANGUAGES.filter((language) =>
    !sameGuide(current[language], expected[language]) && !sameGuide(current[language], repository[language])
  );
  if (conflicts.length) {
    throw new Error(`Guide changed on the site after preparation: ${conflicts.join(", ")}. Run guides:pull, review and commit again. No guide was overwritten.`);
  }
  return GUIDE_LANGUAGES.filter((language) => !sameGuide(current[language], repository[language]));
}
