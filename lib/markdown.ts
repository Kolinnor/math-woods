import katex from "katex";
import { marked, Renderer } from "marked";
import sanitizeHtml from "sanitize-html";
import { findLatexRanges } from "./latex-ranges.ts";
import { jsxGraphCodeBlockHtml } from "./jsxgraph.ts";
import { markdownImageSizingFromSrc } from "./markdown-images.ts";
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
    const token = `@@MATHHILLSLATEX${input.length}TOKEN${index}@@`;
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
    if (latexHtml.startsWith('<span class="katex-display"')) {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      output = output.replace(new RegExp(`${escapedToken}\\s*<br\\s*\\/?>`, "g"), token);
    }
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

const markdownRenderer = new Renderer();
const defaultCodeRenderer = markdownRenderer.code.bind(markdownRenderer);
markdownRenderer.code = (token) => {
  const language = token.lang?.trim().split(/\s+/)[0]?.toLowerCase();
  return language === "jsxgraph" ? jsxGraphCodeBlockHtml(token.text) : defaultCodeRenderer(token);
};

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
    gfm: true,
    renderer: markdownRenderer
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
      "img",
      "svg",
      "path"
    ]),
    allowedAttributes: {
      a: ["href", "class", "rel", "target"],
      code: ["class"],
      div: ["aria-busy", "aria-label", "class", "data-jsxgraph", "role"],
      img: ["src", "alt", "title", "loading", "decoding", "style"],
      ol: ["start"],
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
      }),
      img: (_tagName, attribs) => {
        const sizing = markdownImageSizingFromSrc(attribs.src ?? "");
        const imageAttribs: Record<string, string> = {
          ...attribs,
          src: sizing.src,
          alt: attribs.alt ?? "",
          loading: "lazy",
          decoding: "async"
        };

        if (sizing.width < 100) {
          imageAttribs.style = `width:${sizing.width}%;max-width:100%;height:auto;`;
        }

        return {
          tagName: "img",
          attribs: imageAttribs
        };
      }
    },
    exclusiveFilter: (frame) => {
      if (frame.tag !== "img") return false;
      return !/^https?:\/\//i.test(frame.attribs.src ?? "");
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
      },
      img: {
        height: [/^auto$/],
        "max-width": [/^100%$/],
        width: [/^(?:[5-9]|[1-9]\d|100)%$/]
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
