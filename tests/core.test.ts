import assert from "node:assert/strict";
import { ConceptStatus, QualityStatus, Role } from "@prisma/client";
import { discussionIsUnlocked, formatUnlockDistance, unlockDate } from "../lib/attempts.ts";
import {
  getBooleanAttribute,
  getNumberAttribute,
  getStringArrayAttribute,
  getStringAttribute,
  parseMarkdownDocument
} from "../lib/frontmatter.ts";
import { latexDeleteChange } from "../lib/latex-deletion.ts";
import { slugify } from "../lib/slug.ts";
import { extractWikiLinks, replaceWikiLinks } from "../lib/wikilinks.ts";
import {
  latexPreviewDiagnosticsForRange,
  latexPreviewRenderMode,
  latexPreviewUsesBlockDecoration
} from "../lib/latex-live-preview.ts";
import { normalizeDisplayMathLineBreaks } from "../lib/latex-display-lines.ts";
import { latexCursorTargetForArrow, latexCursorTargetForVerticalArrow } from "../lib/latex-navigation.ts";
import { findLatexRanges } from "../lib/latex-ranges.ts";
import { findLatexSyntaxTokens } from "../lib/latex-syntax-highlight.ts";
import { renderInlineMarkdown, renderMarkdown } from "../lib/markdown.ts";
import {
  assignableRolesFor,
  canAssignRole,
  canDeletePlaylist,
  canEditProblem,
  canSetConceptStatus,
  canSetProblemQualityStatus,
  canUseAdminTools,
  canUseModerationTools,
  hasTrustedPrivileges,
  isVerifiedContributor
} from "../lib/permissions.ts";
import { parseProblemDifficulty, tagsWithConjecture } from "../lib/problems.ts";
import { parseProblemDomains } from "../lib/problem-domains.ts";
import { domainLabel, FLAT_DOMAIN_OPTIONS, parseDomainCode, PROBLEM_DOMAINS } from "../lib/domains.ts";
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
assert.equal(latexPreviewUsesBlockDecoration(mixedDollarText, mixedDollarRanges[1]), false);
assert.deepEqual(normalizeDisplayMathLineBreaks("Before $$x^2 + 1$$ after", 18), {
  text: "Before\n$$x^2 + 1$$\nafter",
  cursor: 18,
  changed: true
});
assert.deepEqual(normalizeDisplayMathLineBreaks("Before\n$$x^2 + 1$$\nafter", 19), {
  text: "Before\n$$x^2 + 1$$\nafter",
  cursor: 19,
  changed: false
});
assert.deepEqual(normalizeDisplayMathLineBreaks("test $$math$$", 0), {
  text: "test\n$$math$$",
  cursor: 0,
  changed: true
});
assert.deepEqual(normalizeDisplayMathLineBreaks("test $$math$$", 5), {
  text: "test\n$$math$$",
  cursor: 5,
  changed: true
});
assert.deepEqual(
  normalizeDisplayMathLineBreaks(
    "Applying $f$ on both sides gives\n$$f(f(f(x)))=f(x+1)$$\nbut this is also equal to $f(x)+1$.",
    61
  ),
  {
    text: "Applying $f$ on both sides gives\n$$f(f(f(x)))=f(x+1)$$\nbut this is also equal to $f(x)+1$.",
    cursor: 61,
    changed: false
  }
);
const normalizedMixedDollarText = normalizeDisplayMathLineBreaks(mixedDollarText).text;
const normalizedMixedDollarRanges = findLatexRanges(normalizedMixedDollarText);
assert.equal(latexPreviewUsesBlockDecoration(normalizedMixedDollarText, normalizedMixedDollarRanges[1]), false);
assert.deepEqual(
  latexPreviewDiagnosticsForRange(mixedDollarText, mixedDollarRanges[1], true, false).map((diagnostic) => diagnostic.code),
  ["display-math-inline-display-fallback"]
);
assert.deepEqual(
  latexPreviewDiagnosticsForRange(mixedDollarText, mixedDollarRanges[1], true, true).map((diagnostic) => diagnostic.code),
  ["display-math-block-on-non-standalone-line"]
);
const standaloneDoubleDollarText = "$$x^2 + 1$$\nnext";
const standaloneDoubleDollarRanges = findLatexRanges(standaloneDoubleDollarText);
assert.equal(latexPreviewRenderMode(standaloneDoubleDollarText, standaloneDoubleDollarRanges[0]), "display");
assert.equal(latexPreviewUsesBlockDecoration(standaloneDoubleDollarText, standaloneDoubleDollarRanges[0]), false);
assert.deepEqual(latexPreviewDiagnosticsForRange(standaloneDoubleDollarText, standaloneDoubleDollarRanges[0], true, false), []);
const centeredDoubleDollarText = "$$2x+1=3x+2$$";
const centeredDoubleDollarRanges = findLatexRanges(centeredDoubleDollarText);
assert.equal(centeredDoubleDollarRanges[0]?.displayMode, true);
assert.equal(latexPreviewRenderMode(centeredDoubleDollarText, centeredDoubleDollarRanges[0]), "display");
assert.equal(latexPreviewUsesBlockDecoration(centeredDoubleDollarText, centeredDoubleDollarRanges[0]), false);
assert.equal(latexCursorTargetForArrow("A $x+1$ B", 2, "forward"), 3);
assert.equal(latexCursorTargetForArrow("A $x+1$ B", 7, "backward"), 6);
assert.equal(latexCursorTargetForArrow(centeredDoubleDollarText, 0, "forward"), 2);
assert.equal(latexCursorTargetForArrow(centeredDoubleDollarText, centeredDoubleDollarText.length, "backward"), 11);
assert.equal(latexCursorTargetForArrow("Let \\(x\\) and \\[y\\].", 4, "forward"), 6);
assert.equal(latexCursorTargetForArrow("Let \\(x\\) and \\[y\\].", 9, "backward"), 7);
assert.equal(latexCursorTargetForArrow("No math here", 0, "forward"), null);
const verticalDisplayText = "above\n$$x+1$$\nbelow";
assert.equal(latexCursorTargetForVerticalArrow(verticalDisplayText, 0, "down"), 8);
assert.equal(latexCursorTargetForVerticalArrow(verticalDisplayText, 14, "up"), 8);
assert.equal(latexCursorTargetForVerticalArrow(verticalDisplayText, 3, "down"), 9);
const verticalMixedText = `0123456789\n${mixedDollarText}`;
assert.equal(latexCursorTargetForVerticalArrow(verticalMixedText, 0, "down"), 12);
assert.equal(latexCursorTargetForVerticalArrow(verticalMixedText, 8, "down"), 21);
assert.equal(latexCursorTargetForVerticalArrow("above\nplain\nbelow", 0, "down"), null);
assert.deepEqual(latexDeleteChange("A $x+1$ B", 7, "backward"), { from: 6, to: 7, anchor: 6 });
assert.deepEqual(latexDeleteChange("A $x+1$ B", 2, "forward"), { from: 2, to: 3, anchor: 2 });
assert.deepEqual(latexDeleteChange(centeredDoubleDollarText, centeredDoubleDollarText.length, "backward"), {
  from: 12,
  to: 13,
  anchor: 12
});
assert.deepEqual(latexDeleteChange(centeredDoubleDollarText, 0, "forward"), { from: 0, to: 1, anchor: 0 });
assert.deepEqual(latexDeleteChange(`Intro\n${mixedDollarText}`, 6, "backward"), { from: 5, to: 6, anchor: 5 });
assert.deepEqual(latexDeleteChange(mixedDollarText, 0, "backward"), { from: 0, to: 0, anchor: 0 });
assert.equal(latexDeleteChange(`Intro ${mixedDollarText}`, 6, "backward"), null);
assert.equal(latexDeleteChange("No math here", 0, "forward"), null);
assert.deepEqual(latexDeleteChange("\ntest $math$", 1, "backward"), { from: 0, to: 1, anchor: 0 });
assert.deepEqual(latexDeleteChange("test\nplain $math$", 4, "forward"), { from: 4, to: 5, anchor: 4 });
assert.deepEqual(latexDeleteChange("$$x$$\nplain", 6, "backward"), { from: 5, to: 6, anchor: 5 });
assert.equal(latexDeleteChange("\ntest plain", 1, "backward"), null);
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
assert.equal(PROBLEM_DOMAINS.length, 21);
assert.equal(parseDomainCode("26"), "26-XX");
assert.equal(parseDomainCode("52-XX"), "51-XX");
assert.equal(parseDomainCode("GEOMETRY"), "51-XX");
assert.equal(domainLabel("26"), "Real analysis");
assert.equal(domainLabel("26-XX"), "Real analysis");
assert.equal(domainLabel("52-XX"), "Geometry");
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
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.MODERATOR), QualityStatus.UNREVIEWED);
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.OWNER), QualityStatus.EXCELLENT);
assert.equal(hasTrustedPrivileges(Role.USER), false);
assert.equal(hasTrustedPrivileges(Role.MODERATOR), true);
assert.equal(canUseModerationTools(Role.MODERATOR), true);
assert.equal(canUseAdminTools(Role.MODERATOR), false);
assert.equal(canUseAdminTools(Role.ADMIN), true);
assert.deepEqual(assignableRolesFor(Role.ADMIN), [Role.USER, Role.MODERATOR]);
assert.deepEqual(assignableRolesFor(Role.OWNER), [Role.USER, Role.MODERATOR, Role.ADMIN]);
assert.equal(
  canAssignRole({ id: 1, role: Role.ADMIN }, { id: 2, role: Role.USER }, Role.MODERATOR),
  true
);
assert.equal(
  canAssignRole({ id: 1, role: Role.ADMIN }, { id: 2, role: Role.USER }, Role.ADMIN),
  false
);
assert.equal(
  canAssignRole({ id: 1, role: Role.OWNER }, { id: 2, role: Role.USER }, Role.ADMIN),
  true
);
assert.equal(canSetProblemQualityStatus(Role.MODERATOR, QualityStatus.GOOD), true);
assert.equal(canSetProblemQualityStatus(Role.MODERATOR, QualityStatus.EXCELLENT), false);
assert.equal(canSetProblemQualityStatus(Role.ADMIN, QualityStatus.EXCELLENT), true);
assert.equal(canSetConceptStatus(Role.MODERATOR, ConceptStatus.REVIEWED), true);
assert.equal(canSetConceptStatus(Role.MODERATOR, ConceptStatus.EXCELLENT), false);
assert.equal(canSetConceptStatus(Role.ADMIN, ConceptStatus.EXCELLENT), true);
assert.equal(isVerifiedContributor({ id: 1, role: Role.USER, emailVerifiedAt: null }), false);
assert.equal(isVerifiedContributor({ id: 1, role: Role.USER, emailVerifiedAt: new Date(0) }), true);
assert.equal(isVerifiedContributor({ id: 1, role: Role.MODERATOR, emailVerifiedAt: null }), true);
assert.equal(canEditProblem({ id: 1, role: Role.USER }, { authorId: 1 }), true);
assert.equal(canEditProblem({ id: 1, role: Role.USER }, { authorId: 2 }), false);
assert.equal(canEditProblem({ id: 1, role: Role.MODERATOR }, { authorId: 2 }), true);
assert.equal(canDeletePlaylist({ id: 1, role: Role.USER }, { authorId: 1 }), true);
assert.equal(canDeletePlaylist({ id: 1, role: Role.USER }, { authorId: 2 }), false);
assert.equal(canDeletePlaylist({ id: 1, role: Role.ADMIN }, { authorId: 2 }), true);
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

const renderedMixedDisplayLatex = await renderMarkdown("Before $$x^2 + 1$$ after");
assert.match(renderedMixedDisplayLatex, /<p>Before\s*<\/p>\s*<p><span class="katex-display"/);
assert.match(renderedMixedDisplayLatex, /<\/span><\/p>\s*<p>\s*after<\/p>/);
assert.equal(/<p>Before\s*<span class="katex-display"/.test(renderedMixedDisplayLatex), false);

const renderedInlineDisplayLatex = await renderInlineMarkdown("Title $$x^2 + 1$$");
assert.match(renderedInlineDisplayLatex, /^Title <span class="katex-display"/);

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
