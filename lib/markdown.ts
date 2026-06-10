import katex from "katex";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { findLatexRanges } from "./latex-ranges.ts";
import { replaceWikiLinks } from "./wikilinks.ts";

function protectLatex(input: string) {
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
    output = `${output.slice(0, range.from)}${token}${output.slice(range.to)}`;
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

export async function renderMarkdown(markdown: string, missingSlugs = new Set<string>()) {
  const { markdown: withLatexTokens, replacements } = protectLatex(markdown);
  const withWikiLinks = replaceWikiLinks(
    withLatexTokens,
    (link) => `/concepts/${link.targetSlug}`,
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
      "none"
    ]),
    allowedAttributes: {
      a: ["href", "class", "rel"],
      code: ["class"],
      span: ["class", "style"],
      math: ["xmlns", "display"],
      annotation: ["encoding"],
      "*": ["aria-hidden"]
    },
    allowedStyles: {
      span: {
        height: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        left: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "margin-left": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "margin-right": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "min-width": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        right: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        top: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        "vertical-align": [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/],
        width: [/^-?\d+(\.\d+)?(em|ex|px|rem|%)$/]
      }
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "/"]
  });
}
