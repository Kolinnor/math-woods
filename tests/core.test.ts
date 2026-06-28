import assert from "node:assert/strict";
import { QualityStatus, Role } from "@prisma/client";
import { discussionIsUnlocked, formatUnlockDistance, unlockDate } from "../lib/attempts.ts";
import {
  getBooleanAttribute,
  getNumberAttribute,
  getStringArrayAttribute,
  getStringAttribute,
  parseMarkdownDocument
} from "../lib/frontmatter.ts";
import { slugify } from "../lib/slug.ts";
import { extractWikiLinks, replaceWikiLinks } from "../lib/wikilinks.ts";
import { latexPreviewRenderMode } from "../lib/latex-live-preview.ts";
import { latexCursorTargetForArrow } from "../lib/latex-navigation.ts";
import { findLatexRanges } from "../lib/latex-ranges.ts";
import { findLatexSyntaxTokens } from "../lib/latex-syntax-highlight.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { parseProblemDifficulty, tagsWithConjecture } from "../lib/problems.ts";
import { parseProblemDomains } from "../lib/problem-domains.ts";
import { domainLabel, FLAT_DOMAIN_OPTIONS, parseDomainCode } from "../lib/domains.ts";
import { findWikiLinkRanges, headingLevel, markdownPreviewClass } from "../lib/markdown-preview.ts";
import { parseContributorQualityStatus, qualityLabel } from "../lib/quality.ts";
import { sanitizeReportPath } from "../lib/security.ts";
import { parseTagInput } from "../lib/tags.ts";

assert.equal(slugify("Relations de Viète"), "relations-de-viete");
assert.equal(slugify("  L'espace vectoriel ! "), "lespace-vectoriel");

const links = extractWikiLinks(
  "Voir [[relations de Viète|Viète]], [[polynôme]], puis [[polynôme]]."
);
assert.deepEqual(
  links.map((link) => [link.targetSlug, link.label]),
  [
    ["relations-de-viete", "Viète"],
    ["polynome", "polynôme"]
  ]
);

assert.deepEqual(
  extractWikiLinks("Code `[[ignored]]` then [[polynomial]].").map((link) => [link.targetSlug, link.label]),
  [["polynomial", "polynomial"]]
);

const html = replaceWikiLinks(
  "A lire: [[racine primitive|racines primitives]].",
  (link) => `/concepts/${link.targetSlug}`,
  new Set(["racine-primitive"])
);
assert.equal(
  html,
  'A lire: <a class="wiki-link missing" href="/concepts/racine-primitive">racines primitives</a>.'
);

const start = new Date("2026-06-04T10:00:00.000Z");
const unlock = unlockDate(start);
assert.equal(unlock.toISOString(), "2026-06-04T10:00:00.000Z");
assert.equal(discussionIsUnlocked(new Date("2099-01-01T00:00:00.000Z"), start), true);
assert.equal(formatUnlockDistance(new Date("2026-06-04T11:30:00.000Z"), start), "1 h 30");

const parsedDoc = parseMarkdownDocument(`---
type: "problem"
title: "Imported Example"
tags: ["algebra", "roots"]
difficulty: 4
listed: false
---

# Body

Let $P$ be a [[polynomial]].`);
assert.equal(getStringAttribute(parsedDoc.attributes, "title"), "Imported Example");
assert.deepEqual(getStringArrayAttribute(parsedDoc.attributes, "tags"), ["algebra", "roots"]);
assert.equal(getNumberAttribute(parsedDoc.attributes, "difficulty"), 4);
assert.equal(getBooleanAttribute(parsedDoc.attributes, "listed"), false);
assert.equal(parsedDoc.body.startsWith("# Body"), true);

assert.deepEqual(findLatexRanges("Let $x^2$ and $$y = x + 1$$ be given."), [
  { from: 4, to: 9, formula: "x^2", displayMode: false },
  { from: 14, to: 27, formula: "y = x + 1", displayMode: true }
]);
assert.deepEqual(findLatexRanges("Price: \\$5. Code: `$x$`."), []);
assert.deepEqual(findLatexRanges("Price: $5 and $6."), []);
assert.deepEqual(findLatexRanges("Let \\(x^2\\) and \\[y=x+1\\]."), [
  { from: 4, to: 11, formula: "x^2", displayMode: false },
  { from: 16, to: 25, formula: "y=x+1", displayMode: true }
]);
assert.deepEqual(findLatexRanges("A standalone display:\n$$\nx^2 + 1\n$$\n1) continue"), [
  { from: 22, to: 35, formula: "x^2 + 1", displayMode: true }
]);
const inlineDoubleDollarRanges = findLatexRanges("Inline display syntax $$x^2 + 1$$ should still preview.");
assert.equal(inlineDoubleDollarRanges[0]?.displayMode, true);
assert.equal(latexPreviewRenderMode("Inline display syntax $$x^2 + 1$$ should still preview.", inlineDoubleDollarRanges[0]), "display");
const mixedDollarText = "$salut$ $$salut$$";
const mixedDollarRanges = findLatexRanges(mixedDollarText);
assert.equal(latexPreviewRenderMode(mixedDollarText, mixedDollarRanges[0]), "inline");
assert.equal(latexPreviewRenderMode(mixedDollarText, mixedDollarRanges[1]), "display");
const standaloneDoubleDollarText = "$$x^2 + 1$$\nnext";
const standaloneDoubleDollarRanges = findLatexRanges(standaloneDoubleDollarText);
assert.equal(latexPreviewRenderMode(standaloneDoubleDollarText, standaloneDoubleDollarRanges[0]), "display");
const centeredDoubleDollarText = "$$2x+1=3x+2$$";
const centeredDoubleDollarRanges = findLatexRanges(centeredDoubleDollarText);
assert.equal(centeredDoubleDollarRanges[0]?.displayMode, true);
assert.equal(latexPreviewRenderMode(centeredDoubleDollarText, centeredDoubleDollarRanges[0]), "display");
assert.equal(latexCursorTargetForArrow("A $x+1$ B", 2, "forward"), 3);
assert.equal(latexCursorTargetForArrow("A $x+1$ B", 7, "backward"), 6);
assert.equal(latexCursorTargetForArrow(centeredDoubleDollarText, 0, "forward"), 2);
assert.equal(latexCursorTargetForArrow(centeredDoubleDollarText, centeredDoubleDollarText.length, "backward"), 11);
assert.equal(latexCursorTargetForArrow("Let \\(x\\) and \\[y\\].", 4, "forward"), 6);
assert.equal(latexCursorTargetForArrow("Let \\(x\\) and \\[y\\].", 9, "backward"), 7);
assert.equal(latexCursorTargetForArrow("No math here", 0, "forward"), null);
assert.deepEqual(
  findLatexSyntaxTokens("$$\\operatorname{Ext}^1(G, H_2)$$", findLatexRanges("$$\\operatorname{Ext}^1(G, H_2)$$")[0]).map(
    (item) => item.kind
  ),
  [
    "delimiter",
    "delimiter",
    "command",
    "bracket",
    "identifier",
    "bracket",
    "operator",
    "number",
    "bracket",
    "identifier",
    "operator",
    "identifier",
    "operator",
    "number",
    "bracket"
  ]
);
assert.equal(parseProblemDifficulty("72"), 72);
assert.equal(parseProblemDifficulty("101"), null);
assert.equal(FLAT_DOMAIN_OPTIONS.filter((option) => /^\d{2}-XX$/.test(option.value)).length, 63);
assert.equal(FLAT_DOMAIN_OPTIONS.some((option) => /^\d{2}\s/.test(option.label)), false);
assert.equal(parseDomainCode("26"), "26-XX");
assert.equal(domainLabel("26"), "Real functions");
assert.equal(domainLabel("26-XX"), "Real functions");
assert.deepEqual(parseProblemDomains(["11-XX", "26-XX"], null, ["26-XX"]), [
  { domain: "ARITHMETIC", mscCode: "11-XX", spoiler: false },
  { domain: "ANALYSIS", mscCode: "26-XX", spoiler: true }
]);
assert.equal(tagsWithConjecture("algebra, conjecture", null), "algebra");
assert.equal(tagsWithConjecture("algebra", "on"), "algebra, conjecture");
assert.deepEqual(parseTagInput("easy, facile, linear algebra, vectors").map((tag) => tag.slug), [
  "linear-algebra",
  "vectors"
]);
assert.equal(qualityLabel(QualityStatus.NEEDS_WORK), "Needs work");
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.USER), QualityStatus.UNREVIEWED);
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.MODERATOR), QualityStatus.EXCELLENT);
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.OWNER), QualityStatus.EXCELLENT);
assert.equal(headingLevel("ATXHeading3"), 3);
assert.equal(headingLevel("Paragraph"), null);
assert.equal(markdownPreviewClass("StrongEmphasis"), "cm-md-strong");
assert.deepEqual(findWikiLinkRanges("See [[polynomial]] and [[vieta-relations|Vieta]]."), [
  { from: 4, to: 18, label: "polynomial" },
  { from: 23, to: 48, label: "Vieta" }
]);
assert.deepEqual(findWikiLinkRanges("Code `[[skip]]` then [[polynomial]]."), [
  { from: 21, to: 35, label: "polynomial" }
]);

const renderedLatex = await renderMarkdown(
  "A real sequence $(u_n)_{n\\geq 0}$ satisfies $u_{n+1}=u_n$ for every $n\\geq 0$."
);
assert.equal(renderedLatex.includes("u_{n+1}=u_n"), true);
assert.equal(renderedLatex.includes("<em>{n\\geq 0}</annotation>"), false);

const renderedBackslashLatex = await renderMarkdown("Let \\(x^2\\) and \\[y=x+1\\].");
assert.equal(renderedBackslashLatex.includes("x^2"), true);
assert.equal(renderedBackslashLatex.includes("y=x+1"), true);

const renderedLatexList = await renderMarkdown(String.raw`\begin{itemize}
\item Either $z$ is a complex eigenvalue.
\item Or all eigenvalues are real.
\end{itemize}`);
assert.equal(renderedLatexList.includes("<ul>"), true);
assert.equal(renderedLatexList.includes("<li>Either"), true);
assert.equal(renderedLatexList.includes("z"), true);

const renderedMatrixLatex = await renderMarkdown(
  String.raw`$$A=\left(\begin{array}{lll}1&2&3\\4&5&6\\7&8&9\end{array}\right)$$`
);
assert.equal(renderedMatrixLatex.includes("mopen"), true);
assert.equal(renderedMatrixLatex.includes("mclose"), true);
assert.equal(renderedMatrixLatex.includes("<svg"), true);
assert.equal(renderedMatrixLatex.includes("viewBox=") || renderedMatrixLatex.includes("viewbox="), true);
assert.equal(renderedMatrixLatex.includes("<path"), true);

const renderedSqrtLatex = await renderMarkdown(String.raw`$$\sqrt{\frac{1}{x^2+1}}$$`);
assert.equal(renderedSqrtLatex.includes("mord sqrt"), true);
assert.equal(renderedSqrtLatex.includes("<svg"), true);
assert.equal(renderedSqrtLatex.includes("preserveAspectRatio=") || renderedSqrtLatex.includes("preserveaspectratio="), true);
assert.equal(renderedSqrtLatex.includes("<path"), true);

const renderedCode = await renderMarkdown("Code `$x$` and `[[not a link]]`, then [[polynomial]].");
assert.equal(renderedCode.includes("<code>$x$</code>"), true);
assert.equal(renderedCode.includes("<code>[[not a link]]</code>"), true);
assert.equal(renderedCode.includes('href="/concepts/polynomial"'), true);

const renderedUnsafeMarkdown = await renderMarkdown("<script>alert(1)</script><img src=x onerror=alert(1)>");
assert.equal(renderedUnsafeMarkdown.includes("<script"), false);
assert.equal(renderedUnsafeMarkdown.includes("onerror"), false);

const renderedUnsafeLink = await renderMarkdown("[bad](javascript:alert(1))");
assert.equal(renderedUnsafeLink.includes('href="javascript:'), false);

const renderedExternalLink = await renderMarkdown("[external](https://example.com)");
assert.equal(renderedExternalLink.includes('href="https://example.com"'), true);
assert.equal(renderedExternalLink.includes('rel="noopener noreferrer nofollow ugc"'), true);
assert.equal(renderedExternalLink.includes('target="_blank"'), true);

const renderedProtocolRelativeLink = await renderMarkdown("[external](//example.com/path)");
assert.equal(renderedProtocolRelativeLink.includes('href="//example.com/path"'), false);

assert.equal(sanitizeReportPath("/edit?token=secret#draft"), "/edit");
assert.equal(sanitizeReportPath("https://mathwoods.org/problem/one?email=a@example.com"), "https://mathwoods.org/problem/one");

console.log("core tests ok");
