import { cleanWikiLinkLabel, cleanWikiLinkTarget, wikiLinkMarkup } from "./wikilinks.ts";

export const EDITOR_LINK_TYPES = ["concept", "problem", "mathematician", "history", "reference"] as const;
export type EditorLinkType = typeof EDITOR_LINK_TYPES[number];
export type EditorLinkSuggestion = {
  targetType: EditorLinkType;
  slug: string;
  title: string;
  titleHtml: string;
  aliases: string[];
  language?: string;
  meta?: string;
};
const paths = { concept: "/concepts/", problem: "/problems/", mathematician: "/library/mathematicians/", history: "/library/history/", reference: "/library/references/" };

export function editorLinkMarkup(target: Pick<EditorLinkSuggestion, "targetType" | "slug" | "title">, text: string) {
  if (!/^[a-z0-9-]+$/i.test(target.slug)) return "";
  const label = cleanWikiLinkLabel(text || target.title);
  return target.targetType === "concept" ? wikiLinkMarkup(target.slug, label) : `[${label}](${paths[target.targetType]}${target.slug})`;
}

// Keep existing destinations when the user reopens a selected internal link.
export function parseEditorLink(text: string) {
  const wiki = text.match(/^\[\[([^\]\n]+)\]\]$/);
  if (wiki) {
    const [target, label] = wiki[1].split("|", 2);
    return { targetType: "concept" as const, target: cleanWikiLinkTarget(target), label: cleanWikiLinkLabel(label ?? target) };
  }
  const link = text.match(/^\[([^\]\n]+)\]\((\/[^\s)]+)\)$/);
  if (!link) return null;
  for (const type of EDITOR_LINK_TYPES.filter(t => t !== "concept")) {
    if (!link[2].startsWith(paths[type])) continue;
    const slug = link[2].slice(paths[type].length);
    if (/^[a-z0-9-]+$/i.test(slug)) return { targetType: type, target: slug, label: cleanWikiLinkLabel(link[1]) };
  }
  return null;
}
