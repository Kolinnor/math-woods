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
import { findLatexRanges } from "../lib/latex-ranges.ts";
import { renderMarkdown } from "../lib/markdown.ts";
import { parseProblemDifficulty, tagsWithConjecture } from "../lib/problems.ts";
import { findWikiLinkRanges, headingLevel, markdownPreviewClass } from "../lib/markdown-preview.ts";
import { parseContributorQualityStatus, qualityLabel } from "../lib/quality.ts";
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
assert.equal(unlock.toISOString(), "2026-06-05T10:00:00.000Z");
assert.equal(discussionIsUnlocked(unlock, new Date("2026-06-05T09:59:00.000Z")), false);
assert.equal(discussionIsUnlocked(unlock, new Date("2026-06-05T10:00:00.000Z")), true);
assert.equal(formatUnlockDistance(unlock, new Date("2026-06-05T08:30:00.000Z")), "1 h 30");

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
assert.equal(parseProblemDifficulty("72"), 72);
assert.equal(parseProblemDifficulty("101"), null);
assert.equal(tagsWithConjecture("algebra, conjecture", null), "algebra");
assert.equal(tagsWithConjecture("algebra", "on"), "algebra, conjecture");
assert.deepEqual(parseTagInput("easy, facile, linear algebra, vectors").map((tag) => tag.slug), [
  "linear-algebra",
  "vectors"
]);
assert.equal(qualityLabel(QualityStatus.NEEDS_WORK), "Needs work");
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.USER), QualityStatus.UNREVIEWED);
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.MODERATOR), QualityStatus.EXCELLENT);
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

const renderedCode = await renderMarkdown("Code `$x$` and `[[not a link]]`, then [[polynomial]].");
assert.equal(renderedCode.includes("<code>$x$</code>"), true);
assert.equal(renderedCode.includes("<code>[[not a link]]</code>"), true);
assert.equal(renderedCode.includes('href="/concepts/polynomial"'), true);

console.log("core tests ok");
