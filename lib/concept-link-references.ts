import { lexer, walkTokens } from "marked";
import { extractWikiLinks, type WikiLink } from "./wikilinks.ts";

// Include ordinary Markdown links as well as the editor's [[concept]] syntax.
// The Markdown parser excludes inline/fenced code and resolves reference links.
export function extractConceptReferences(markdown: string): WikiLink[] {
  const links = extractWikiLinks(markdown);
  walkTokens(lexer(markdown), token => {
    if (token.type !== "link") return;
    const href = token.href.replace(/^https:\/\/(?:www\.)?mathwoods\.org(?=\/)/, "");
    const match = /^\/concepts\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:[?#].*)?$/.exec(href);
    if (match) links.push({ raw: token.raw, target: match[1], targetSlug: match[1], label: token.text || match[1] });
  });
  return links;
}
