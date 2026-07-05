import katex from "katex";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { findLatexRanges } from "./latex-ranges.ts";
import { replaceWikiLinks } from "./wikilinks.ts";

function externalLinkAttributes(href: string | undefined): Record<string, string> {
  if (!href) return {};
  if (!/^https?:\/\//i.test(href)) return {};

  return {
    target: "_blank",
    rel: "noopener noreferrer nofollow ugc"
  };
}

function latexTokenMarkdown(input: string, range: ReturnType<typeof findLatexRanges>[number], token: string) {
  if (!range.displayMode) return token;

  const lineStart = input.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1;
  const nextBreak = input.indexOf("\n", range.to);
  const lineEnd = nextBreak === -1 ? input.length : nextBreak;
  const beforeOnLine = input.slice(lineStart, range.from);
  const afterOnLine = input.slice(range.to, lineEnd);
  const leadingBreak = beforeOnLine.trim() === "" ? "" : "\n\n";
  const trailingBreak = afterOnLine.trim() === "" ? "" : "\n\n";

  return `${leadingBreak}${token}${trailingBreak}`;
}

function protectLatex(input: string, blockDisplayMath = true) {
  const replacements = new Map<string, string>();
  const ranges = findLatexRanges(input);
  let output = input;

  for (let index = ranges.length - 1; index >= 0; index -= 1) {
    const range = ranges[index];
    const token = `MATHHILLSLATEX${input.length}TOKEN${index}`;
    replacements.set(
      token,
      katex.renderToString(range.formula, {
        displayMode: range.displayMode,
        throwOnError: false
      })
    );
    const markdownToken = blockDisplayMath ? latexTokenMarkdown(input, range, token) : token;
    output = `${output.slice(0, range.from)}${markdownToken}${output.slice(range.to)}`;
  }

  return { markdown: output, replacements };
}

function restoreLatex(html: string, replacements: Map<string, string>) {
  let output = html;

  for (const [token, latexHtml] of replacements) {
    output = output.replaceAll(token, latexHtml);
  }

  return output;
}

function normalizeLatexLists(markdown: string) {
  return markdown.replace(
    /\\begin\{(itemize|enumerate)\}([\s\S]*?)\\end\{\1\}/g,
    (_match: string, listType: "itemize" | "enumerate", content: string) => {
      const marker = listType === "enumerate" ? "1." : "-";
      const items = content
        .split(/\\item\b/g)
        .slice(1)
        .map((item) => item.trim())
        .filter(Boolean);

      if (!items.length) return "";

      return items
        .map((item) => {
          const normalizedItem = item.replace(/\n+/g, "\n  ");
          return `${marker} ${normalizedItem}`;
        })
        .join("\n");
    }
  );
}

export async function renderMarkdown(
  markdown: string,
  missingSlugs = new Set<string>(),
  blockDisplayMath = true,
  resolveWikiHref = (link: { targetSlug: string }) => `/concepts/${link.targetSlug}`
) {
  const normalizedMarkdown = normalizeLatexLists(markdown);
  const { markdown: withLatexTokens, replacements } = protectLatex(normalizedMarkdown, blockDisplayMath);
  const withWikiLinks = replaceWikiLinks(
    withLatexTokens,
    resolveWikiHref,
    missingSlugs
  );
  const html = await marked.parse(withWikiLinks, {
    async: true,
    breaks: true,
    gfm: true
  });
  const htmlWithLatex = restoreLatex(html, replacements);

  return sanitizeHtml(htmlWithLatex, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "span",
      "math",
      "semantics",
      "annotation",
      "annotation-xml",
      "maligngroup",
      "malignmark",
      "menclose",
      "mrow",
      "mi",
      "mn",
      "mo",
      "mover",
      "mpadded",
      "msup",
      "msub",
      "msubsup",
      "mfrac",
      "mroot",
      "msqrt",
      "mspace",
      "mstyle",
      "mtext",
      "mtable",
      "mtr",
      "mtd",
      "munder",
      "munderover",
      "none",
      "svg",
      "path"
    ]),
    allowedAttributes: {
      a: ["href", "class", "rel", "target"],
      code: ["class"],
      span: ["class", "style"],
      math: ["xmlns", "display"],
      annotation: ["encoding"],
      svg: ["xmlns", "width", "height", "viewBox", "viewbox", "preserveAspectRatio", "preserveaspectratio"],
      path: ["d"],
      "*": ["aria-hidden"]
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          ...externalLinkAttributes(attribs.href)
        }
      })
    },
    allowedStyles: {
      span: {
        "border-bottom-width": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "border-left-width": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "border-right-width": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "border-top-width": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        height: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        left: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "margin-left": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "margin-right": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "min-width": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "padding-left": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "padding-right": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        right: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        top: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "vertical-align": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        width: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/]
      }
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowProtocolRelative: false
  });
}

export async function renderInlineMarkdown(markdown: string, missingSlugs = new Set<string>()) {
  const html = await renderMarkdown(markdown, missingSlugs, false);
  const trimmed = html.trim();
  const singleParagraph = trimmed.match(/^<p>([\s\S]*)<\/p>$/);

  return singleParagraph ? singleParagraph[1] : trimmed;
}
