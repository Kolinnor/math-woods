import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConceptKind, ConceptStatus, MathDomain, Prisma, QualityStatus, Role, UserMathLevel } from "@prisma/client";
import { EditorState, StateEffect } from "@codemirror/state";
import { discussionIsUnlocked, formatUnlockDistance, unlockDate } from "../lib/attempts.ts";
import {
  getBooleanAttribute,
  getNumberAttribute,
  getStringArrayAttribute,
  getStringAttribute,
  parseMarkdownDocument
} from "../lib/frontmatter.ts";
import { latexDeleteChange } from "../lib/latex-deletion.ts";
import { markdownDraftConflictsWithSource } from "../lib/markdown-drafts.ts";
import {
  MAX_CONCEPT_EXERCISES,
  parseConceptExerciseCount,
  parseConceptExerciseCountMode,
  parseConceptExerciseIds,
  parseMinimumConceptExercises
} from "../lib/concept-exercises.ts";
import { parseConceptKind } from "../lib/concept-kinds.ts";
import { slugify } from "../lib/slug.ts";
import { PROBLEM_DIFFICULTY_HELP, problemDifficultyBars, problemDifficultyTone } from "../lib/problem-difficulty.ts";
import {
  hasProblemReviewSensitiveChanges,
  needsReviewAfterProblemEdit
} from "../lib/problem-review-state.ts";
import {
  buildRecommendationProfile,
  scoreProblemRecommendation
} from "../lib/recommendations.ts";
import {
  defaultProblemContentTypesForMathLevel,
  isDefaultProblemContentType,
  parseProblemContentTypes,
  problemContentTypeWhere
} from "../lib/problem-content-types.ts";
import { selectProblemHintsForLanguage } from "../lib/problem-hints.ts";
import { buildProgressMap } from "../lib/progress.ts";
import { pickRandomDifferent } from "../lib/random-content.ts";
import { canViewProblem, visibleProblemWhere } from "../lib/problem-visibility.ts";
import { extractWikiLinks, problemLinkMarkup, replaceWikiLinks, wikiLinkMarkup } from "../lib/wikilinks.ts";
import { wikiLinkDeleteChange } from "../lib/wiki-link-deletion.ts";
import {
  buildAvatarObjectKey,
  buildChatImageObjectKey,
  buildImageObjectKey,
  createPresignedImageDownload,
  createPresignedImageDelete,
  createPresignedImageUpload,
  imageObjectKeyFromPublicUrl,
  validateImageUploadInput,
  type ImageStorageConfig
} from "../lib/image-storage.ts";
import { chatImageDailyLimitForRole, chatImageUrl } from "../lib/chat-image-config.ts";
import { chunkLoadErrorSignature, isChunkLoadError } from "../lib/chunk-load-error.ts";
import { chatDayKey } from "../lib/chat-dates.ts";
import { shouldSendChatOnEnter } from "../lib/chat-compose.ts";
import { normalizeChatReplyToId } from "../lib/chat-replies.ts";
import { applyChatMessageDeletions, applyChatMessageUpdates } from "../lib/chat-message-updates.ts";
import {
  applyChatReactionUpdates,
  isChatReaction,
  summarizeChatReactions
} from "../lib/chat-reactions.ts";
import { chatUnreadDocumentTitle } from "../lib/chat-unread.ts";
import {
  addDaysToDateKey,
  automaticDailyProblemGroup,
  dailyProblemDefaultImageUrl,
  dailyProblemDateKey,
  dailyProblemRotationIndex,
  DEFAULT_DAILY_PROBLEM_IMAGE_URLS,
  isDailyProblemDateKey,
  upcomingDailyProblemDateKeys
} from "../lib/daily-problem-schedule.ts";
import {
  DEFAULT_TIP_IMAGE_POSITION,
  DEFAULT_TIP_IMAGE_URL,
  normalizeTipImagePosition,
  normalizeTipImageUrl,
  tipImageObjectPosition,
  tipImageUrl
} from "../lib/tip-images.ts";
import {
  AVATAR_BACKGROUND_OPTIONS,
  DEFAULT_AVATAR_PRESETS,
  avatarBackgroundOption,
  avatarPresetFromUrl,
  defaultAvatarPath,
  defaultAvatarPresetForUsername,
  parseAvatarBackground,
  parseDefaultAvatarPreset
} from "../lib/avatar-presets.ts";
import { en } from "../lib/i18n/dictionaries/en.ts";
import { fr } from "../lib/i18n/dictionaries/fr.ts";
import {
  normalizeProblemChallengeMessage,
  problemDeliveryChatMarkdown,
  problemChallengeNotificationBody,
  problemShareNotificationBody,
  PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH
} from "../lib/problem-challenges.ts";
import {
  normalizeProblemChallengeInviteToken,
  problemChallengeInvitePath,
  problemChallengeInviteTokenHash
} from "../lib/problem-challenge-invites.ts";
import {
  CONTENT_CREATION_WINDOW_MS,
  assertDailyContentCreationQuota,
  contentCreationWindowStart,
  dailyContentCreationLimitForRole
} from "../lib/content-creation-quota.ts";
import {
  latexPreviewDiagnosticsForRange,
  latexPreviewRenderMode,
  latexPreviewUsesBlockDecoration,
  latexPreviewUsesCenteredLine,
  selectionSpansLineBreakInsideLatexRange
} from "../lib/latex-live-preview.ts";
import { normalizeDisplayMathLineBreaks } from "../lib/latex-display-lines.ts";
import { explorationSnapshotPages } from "../lib/exploration-snapshot.ts";
import { EXPLORATION_CHANGE_COALESCE_MS, shouldCoalesceExplorationChange } from "../lib/exploration-history.ts";
import { hasReachableExplorationExit } from "../lib/exploration-navigation.ts";
import { resolveExplorationQuizOutcome } from "../lib/exploration-routing.ts";
import { reachableExplorationPageIds } from "../lib/exploration-map-analysis.ts";
import {
  canAutomaticallyAdvance,
  explorationPathAfter,
  nextExplorationBlockId,
  reachableExplorationBlockIds
} from "../lib/exploration-block-graph.ts";
import {
  moveExplorationBlockToFolder,
  moveExplorationBlockFolder,
  orderExplorationBlocksByFolders
} from "../lib/exploration-block-folders.ts";
import {
  clearExplorationBranches,
  descendantExplorationBranchIds,
  explorationBranchStateKey,
  visibleExplorationBlocks
} from "../lib/exploration-branches.ts";
import { evaluateExplorationQuizSelection } from "../lib/exploration-quiz.ts";
import { guestProgressContentKey } from "../lib/guest-progress.ts";
import { parseOAuthProvider, safeReturnTo, selectVerifiedGithubEmail } from "../lib/oauth-utils.ts";
import {
  filterMathematicians,
  mathematicianContributionCount,
  sortMathematicians
} from "../lib/mathematicians.ts";
import type { UserReputationSummary } from "../lib/user-reputation.ts";
import {
  DAILY_PROBLEM_REPUTATION_POINTS,
  dailyProblemReputationBonus
} from "../lib/reputation-scoring.ts";
import {
  createDisplayMathLineBreakNormalizer,
  skipDisplayMathLineBreakNormalization
} from "../lib/latex-display-line-transactions.ts";
import {
  latexAlignShortcut,
  latexDisplayMathShortcut,
  latexEditorPreferencesFromApi,
  latexInlineMathShortcut,
  latexKeyboardShortcut,
  latexMatrixShortcut,
  latexShiftEnterShortcut,
  latexTabShortcut,
  latexTextInputShortcut,
  parseLatexCustomCommands
} from "../lib/latex-editor-shortcuts.ts";
import { DEFAULT_LATEX_PREFERENCES } from "../lib/latex-preferences.ts";
import { latexCursorTargetForArrow, latexCursorTargetForVerticalArrow } from "../lib/latex-navigation.ts";
import { findLatexRanges } from "../lib/latex-ranges.ts";
import { findLatexSyntaxTokens } from "../lib/latex-syntax-highlight.ts";
import { renderInlineMarkdown, renderMarkdown } from "../lib/markdown.ts";
import {
  DEFAULT_MARKDOWN_FOLD_TITLE,
  extractMarkdownFolds,
  markdownFoldBlock
} from "../lib/markdown-folds.ts";
import {
  decodeJsxGraphConfig,
  encodeJsxGraphConfig,
  parseJsxGraphConfig
} from "../lib/jsxgraph.ts";
import {
  assignableRolesFor,
  canAssignRole,
  canChangeConceptStatus,
  canDeletePlaylist,
  canEditProblem,
  canManageUserRoles,
  canReviewConcept,
  canReviewProblem,
  canSetConceptStatus,
  canSetProblemQualityStatus,
  canUseAdminTools,
  canUseModerationTools,
  hasTrustedPrivileges,
  isVerifiedContributor
} from "../lib/permissions.ts";
import { parseProblemDifficulty, tagsWithConjecture } from "../lib/problems.ts";
import { parseProblemDomains } from "../lib/problem-domains.ts";
import { heroArtForProblemDomain, PROBLEM_DOMAIN_HERO_ART } from "../lib/problem-hero-art.ts";
import {
  coarseDomainForCode,
  domainCodeAliases,
  domainLabel,
  FLAT_DOMAIN_OPTIONS,
  FLAT_PROBLEM_DOMAIN_OPTIONS,
  parseDomainCode,
  PROBLEM_DOMAINS,
  translatedDomainLabel,
  translatedDomainOptions
} from "../lib/domains.ts";
import {
  DEFAULT_MARKDOWN_HEADING_SHORTCUTS,
  keyboardEventMatchesShortcut,
  markdownHeadingLevelForEvent,
  markdownHeadingLineText
} from "../lib/markdown-shortcuts.ts";
import {
  findProblemLinkRanges,
  findWikiLinkRanges,
  headingLevel,
  markdownHeadingPreviewText,
  markdownPreviewClass
} from "../lib/markdown-preview.ts";
import {
  findMarkdownQuestionMarkers,
  normalizeMarkdownQuestionMarkers
} from "../lib/markdown-question-markers.ts";
import { markdownExcerpt } from "../lib/metadata-text.ts";
import { shouldNotifyAdminsOfContributorCreation } from "../lib/admin-creation-notifications.ts";
import { problemEditNotificationRecipientIds } from "../lib/problem-edit-notifications.ts";
import {
  mergeProblemRevisionSnapshots,
  parseProblemRevisionSnapshot,
  type ProblemRevisionSnapshot
} from "../lib/problem-revisions.ts";
import { buildRevisionDiff } from "../lib/revision-diff.ts";
import { parseContributorQualityStatus, qualityLabel } from "../lib/quality.ts";
import { sanitizeReportPath } from "../lib/security.ts";
import { rankSearchMatches, searchMatchScore, searchMorphologyVariants } from "../lib/search-ranking.ts";
import { parseTagInput } from "../lib/tags.ts";
import {
  nextMissingTranslationLanguage,
  preferredTranslationForLanguage,
  translationLanguageSet
} from "../lib/translation-routing.ts";
import { dictionaryForContentLanguage, interfaceLocaleForContentLanguage } from "../lib/i18n/dictionary.ts";
import {
  applyEffects,
  conditionMatches,
  numericAnswerMatches,
  parseExplorationValue
} from "../lib/exploration-engine.ts";

assert.equal(slugify("Relations de Viète"), "relations-de-viete");
assert.equal(slugify("  L'espace vectoriel ! "), "lespace-vectoriel");
assert.equal(problemDifficultyTone(null), "#8a9184");
assert.equal(problemDifficultyTone(1), "#4f7955");
assert.equal(problemDifficultyTone(20), "#617a42");
assert.equal(problemDifficultyTone(40), "#857a35");
assert.equal(problemDifficultyTone(100), "#87342d");
assert.notEqual(problemDifficultyTone(19), problemDifficultyTone(20));
assert.notEqual(problemDifficultyTone(20), problemDifficultyTone(21));
assert.notEqual(problemDifficultyTone(39), problemDifficultyTone(40));
assert.equal(problemDifficultyBars(25), 1);
const revisionDiff = buildRevisionDiff(
  "Let $G$ be finite.\nThe first statement.",
  "Let $G$ be finite.\nThe revised statement.\nA new line."
);
assert.deepEqual(revisionDiff.map((row) => row.kind), ["context", "removed", "added", "added"]);
assert.equal(
  revisionDiff
    .find((row) => row.kind === "added")
    ?.parts.filter((part) => part.changed)
    .map((part) => part.value)
    .join(""),
  "revised"
);
assert.equal(problemDifficultyBars(45), 2);
assert.equal(problemDifficultyBars(65), 3);
assert.equal(problemDifficultyBars(100), 4);

const groupedTranslations = [
  { language: "fr", slug: "relations-de-viete" },
  { language: "es", slug: "relaciones-de-vieta" }
];
assert.equal(preferredTranslationForLanguage("en", groupedTranslations, "fr")?.slug, "relations-de-viete");
assert.equal(preferredTranslationForLanguage("fr", groupedTranslations, "fr"), null);
assert.equal(nextMissingTranslationLanguage("en", groupedTranslations, "fr"), "de");
assert.equal(nextMissingTranslationLanguage("en", groupedTranslations, "it"), "it");
assert.deepEqual([...translationLanguageSet("en", groupedTranslations)], ["en", "fr", "es"]);
assert.equal(interfaceLocaleForContentLanguage("fr"), "fr");
assert.equal(interfaceLocaleForContentLanguage("es"), "en");
assert.equal(dictionaryForContentLanguage("fr").nav.problems, "Problèmes");
assert.equal(dictionaryForContentLanguage("es").nav.problems, "Problems");

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
assert.equal(wikiLinkMarkup("Category", "this is a category"), "[[Category|this is a category]]");
assert.equal(wikiLinkMarkup("Category", "Category"), "[[Category|Category]]");
assert.equal(problemLinkMarkup("A problem slug", "this problem"), "[this problem](/problems/a-problem-slug)");
assert.equal(markdownExcerpt("Use [[polynomial|polynomials]] and $x^2$.", "fallback"), "Use polynomials and formula .");
assert.equal(
  markdownDraftConflictsWithSource(
    { value: "Local edit", updatedAt: 100, baseValue: "Old server text" },
    "New server text",
    200
  ),
  true
);
assert.equal(
  markdownDraftConflictsWithSource(
    { value: "Local edit", updatedAt: 300, baseValue: "Current server text" },
    "Current server text",
    200
  ),
  false
);
assert.equal(
  markdownDraftConflictsWithSource(
    { value: "Legacy local edit", updatedAt: 100 },
    "New server text",
    200
  ),
  true
);

const baseProblemSnapshot: ProblemRevisionSnapshot = {
  schemaVersion: 1,
  title: "Original title",
  language: "en",
  bodyMarkdown: "Original statement",
  difficulty: 20,
  domains: [{ domain: MathDomain.ALGEBRA, mscCode: MathDomain.ALGEBRA, spoiler: false }],
  origin: "Unknown",
  originChapter: null,
  originPage: null,
  originNote: null,
  listed: true,
  isExercise: false,
  showRelatedProblems: true,
  canAppearOnFrontPage: false,
  status: "PUBLISHED",
  qualityStatus: QualityStatus.UNREVIEWED,
  verificationMode: "NONE",
  verificationPrompt: null,
  verificationAnswer: null,
  translatedFromRevisionId: null,
  tags: [],
  spoilerTags: [],
  relatedProblemGroups: []
};
const independentlyEditedSnapshot = mergeProblemRevisionSnapshots(
  baseProblemSnapshot,
  { ...baseProblemSnapshot, title: "Title from Alice" },
  { ...baseProblemSnapshot, bodyMarkdown: "Statement from Bob" }
);
assert.deepEqual(independentlyEditedSnapshot.conflicts, []);
assert.equal(independentlyEditedSnapshot.merged.title, "Title from Alice");
assert.equal(independentlyEditedSnapshot.merged.bodyMarkdown, "Statement from Bob");

const conflictingProblemSnapshot = mergeProblemRevisionSnapshots(
  baseProblemSnapshot,
  { ...baseProblemSnapshot, title: "Title from Alice", bodyMarkdown: "Statement from Alice" },
  { ...baseProblemSnapshot, title: "Title from Bob" }
);
assert.deepEqual(conflictingProblemSnapshot.conflicts, ["title"]);
assert.equal(conflictingProblemSnapshot.merged.title, "Title from Bob");
assert.equal(conflictingProblemSnapshot.merged.bodyMarkdown, "Statement from Alice");

const identicalProblemSnapshot = mergeProblemRevisionSnapshots(
  baseProblemSnapshot,
  { ...baseProblemSnapshot, difficulty: 30 },
  { ...baseProblemSnapshot, difficulty: 30 }
);
assert.deepEqual(identicalProblemSnapshot.conflicts, []);
assert.equal(identicalProblemSnapshot.merged.difficulty, 30);
const legacyExcellentSnapshot = parseProblemRevisionSnapshot({
  ...baseProblemSnapshot,
  qualityStatus: "EXCELLENT"
});
assert.equal(legacyExcellentSnapshot?.qualityStatus, QualityStatus.REVIEWED);
assert.equal(legacyExcellentSnapshot?.canAppearOnFrontPage, true);
assert.equal(legacyExcellentSnapshot?.isExercise, false);
assert.equal(legacyExcellentSnapshot?.showRelatedProblems, true);
const legacyExerciseSnapshot = JSON.parse(JSON.stringify({
  ...baseProblemSnapshot,
  isExercise: true
}));
delete legacyExerciseSnapshot.showRelatedProblems;
assert.equal(
  parseProblemRevisionSnapshot(legacyExerciseSnapshot)?.showRelatedProblems,
  false
);
assert.deepEqual(parseProblemContentTypes(undefined), ["problem"]);
assert.deepEqual(parseProblemContentTypes(["exercise"]), ["exercise"]);
assert.deepEqual(parseProblemContentTypes(["exercise", "problem", "unknown"]), ["problem", "exercise"]);
assert.deepEqual(defaultProblemContentTypesForMathLevel(UserMathLevel.BEGINNER_PRE_UNIVERSITY), ["problem", "exercise"]);
assert.deepEqual(defaultProblemContentTypesForMathLevel(UserMathLevel.EARLY_UNDERGRAD), ["problem", "exercise"]);
assert.deepEqual(defaultProblemContentTypesForMathLevel(UserMathLevel.UNDERGRAD), ["problem"]);
assert.deepEqual(defaultProblemContentTypesForMathLevel(null), ["problem"]);
assert.deepEqual(
  parseProblemContentTypes(undefined, defaultProblemContentTypesForMathLevel(UserMathLevel.BEGINNER_PRE_UNIVERSITY)),
  ["problem", "exercise"]
);
assert.deepEqual(problemContentTypeWhere(["problem"]), { isExercise: false });
assert.deepEqual(problemContentTypeWhere(["exercise"]), { isExercise: true });
assert.equal(problemContentTypeWhere(["problem", "exercise"]), null);
assert.equal(isDefaultProblemContentType(["problem"]), true);
assert.equal(isDefaultProblemContentType(["problem", "exercise"], ["problem", "exercise"]), true);
assert.equal(isDefaultProblemContentType(["problem"], ["problem", "exercise"]), false);
assert.deepEqual(parseConceptExerciseIds(["4", "2", "4", "invalid", "-1", "7"]), [4, 2, 7]);
assert.equal(
  parseConceptExerciseIds(Array.from({ length: MAX_CONCEPT_EXERCISES + 3 }, (_, index) => String(index + 1))).length,
  MAX_CONCEPT_EXERCISES
);

const start = new Date("2026-06-04T10:00:00.000Z");
const unlock = unlockDate(start);
assert.equal(unlock.toISOString(), "2026-06-04T10:00:00.000Z");
assert.equal(discussionIsUnlocked(new Date("2099-01-01T00:00:00.000Z"), start), true);
assert.equal(formatUnlockDistance(new Date("2026-06-04T11:30:00.000Z"), start), "1 h 30");
assert.equal(chatDayKey("2026-07-19T00:30:00.000Z", "UTC"), "2026-07-19");
assert.equal(chatDayKey("2026-07-19T00:30:00.000Z", "America/New_York"), "2026-07-18");
assert.equal(chatUnreadDocumentTitle("Math Woods", 1), "(1) Math Woods");
assert.equal(chatUnreadDocumentTitle("(1) Math Woods", 3), "(3) Math Woods");
assert.equal(chatUnreadDocumentTitle("(99+) Math Woods", 0), "Math Woods");
assert.equal(chatUnreadDocumentTitle("A problem - Math Woods", 120), "(99+) A problem - Math Woods");
assert.equal(
  canViewProblem(null, { authorId: 7, qualityStatus: QualityStatus.UNREVIEWED }),
  true
);
assert.deepEqual(visibleProblemWhere(null), {});
assert.equal(shouldSendChatOnEnter({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false
}), true);
assert.equal(shouldSendChatOnEnter({
  key: "Enter",
  shiftKey: true,
  altKey: false,
  ctrlKey: false,
  metaKey: false
}), false);
assert.equal(shouldSendChatOnEnter({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: true
}), false);
assert.equal(shouldSendChatOnEnter({
  key: "Enter",
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  keyCode: 229
}), false);
assert.equal(normalizeChatReplyToId("42"), 42);
assert.equal(normalizeChatReplyToId(7), 7);
assert.equal(normalizeChatReplyToId(""), null);
assert.equal(normalizeChatReplyToId("4.2"), null);
assert.equal(normalizeChatReplyToId("../12"), null);
assert.deepEqual(
  applyChatMessageDeletions([{ id: 1 }, { id: 2 }, { id: 3 }], [2, 99]),
  [{ id: 1 }, { id: 3 }]
);
assert.equal(isChatReaction("HEART"), true);
assert.equal(isChatReaction("FIRE"), false);
assert.deepEqual(
  summarizeChatReactions(
    [
      { reaction: "HEART", userId: 3 },
      { reaction: "LIKE", userId: 2 },
      { reaction: "HEART", userId: 2 },
      { reaction: "UNKNOWN", userId: 2 }
    ],
    2
  ),
  [
    { reaction: "LIKE", count: 1, reactedByCurrentUser: true },
    { reaction: "HEART", count: 2, reactedByCurrentUser: true }
  ]
);
assert.deepEqual(
  applyChatReactionUpdates(
    [
      { id: 10, body: "First", reactions: [] },
      { id: 11, body: "Second", reactions: [] }
    ],
    [{
      messageId: 11,
      reactions: [{ reaction: "SMILE", count: 2, reactedByCurrentUser: false }]
    }]
  ),
  [
    { id: 10, body: "First", reactions: [] },
    {
      id: 11,
      body: "Second",
      reactions: [{ reaction: "SMILE", count: 2, reactedByCurrentUser: false }]
    }
  ]
);
assert.deepEqual(
  applyChatMessageUpdates(
    [
      {
        id: 10,
        bodyMarkdown: "First",
        bodyHtml: "<p>First</p>",
        editedAt: null,
        reactions: []
      },
      {
        id: 11,
        bodyMarkdown: "Second",
        bodyHtml: "<p>Second</p>",
        editedAt: null,
        reactions: []
      }
    ],
    [{
      messageId: 11,
      bodyMarkdown: "Edited second",
      bodyHtml: "<p>Edited second</p>",
      editedAt: "2026-07-31T08:00:00.000Z",
      reactions: [{ reaction: "HEART", count: 1, reactedByCurrentUser: false }]
    }]
  ),
  [
    {
      id: 10,
      bodyMarkdown: "First",
      bodyHtml: "<p>First</p>",
      editedAt: null,
      reactions: []
    },
    {
      id: 11,
      bodyMarkdown: "Edited second",
      bodyHtml: "<p>Edited second</p>",
      editedAt: "2026-07-31T08:00:00.000Z",
      reactions: [{ reaction: "HEART", count: 1, reactedByCurrentUser: false }]
    }
  ]
);

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
assert.equal(latexPreviewUsesCenteredLine(mixedDollarText, mixedDollarRanges[0]), false);
assert.equal(latexPreviewUsesCenteredLine(mixedDollarText, mixedDollarRanges[1]), false);
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
assert.equal(latexPreviewUsesCenteredLine(standaloneDoubleDollarText, standaloneDoubleDollarRanges[0]), true);
assert.deepEqual(latexPreviewDiagnosticsForRange(standaloneDoubleDollarText, standaloneDoubleDollarRanges[0], true, false), []);
const multilineDisplayText = String.raw`$$\begin{array}{rlrl}
G \times G & \longrightarrow G & G & \longrightarrow G \\
(g, h) & \longmapsto g h & g & \longmapsto g^{-1}
\end{array}$$`;
const multilineDisplayRange = findLatexRanges(multilineDisplayText)[0];
assert.equal(
  selectionSpansLineBreakInsideLatexRange(
    multilineDisplayText,
    multilineDisplayRange,
    multilineDisplayRange.from + 2,
    multilineDisplayRange.to - 2
  ),
  true
);
assert.equal(
  selectionSpansLineBreakInsideLatexRange(
    multilineDisplayText,
    multilineDisplayRange,
    multilineDisplayRange.from + 2,
    multilineDisplayText.indexOf("\n")
  ),
  false
);
assert.equal(
  selectionSpansLineBreakInsideLatexRange(
    multilineDisplayText,
    multilineDisplayRange,
    multilineDisplayRange.to,
    multilineDisplayRange.to
  ),
  false
);
const centeredDoubleDollarText = "$$2x+1=3x+2$$";
const centeredDoubleDollarRanges = findLatexRanges(centeredDoubleDollarText);
assert.equal(centeredDoubleDollarRanges[0]?.displayMode, true);
assert.equal(latexPreviewRenderMode(centeredDoubleDollarText, centeredDoubleDollarRanges[0]), "display");
assert.equal(latexPreviewUsesBlockDecoration(centeredDoubleDollarText, centeredDoubleDollarRanges[0]), false);
const compactDisplayLinesText = "$ligne1$\n$$ligne2$$\n$$ligne3$$";
assert.deepEqual(
  findLatexRanges(compactDisplayLinesText).map((range) => latexPreviewUsesCenteredLine(compactDisplayLinesText, range)),
  [false, true, true]
);
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
for (const range of ["1-5", "6-19", "20-39", "40-64", "65-84", "85-100"]) {
  assert.equal(PROBLEM_DIFFICULTY_HELP.includes(range), true);
}
assert.equal(FLAT_DOMAIN_OPTIONS.filter((option) => /^\d{2}-XX$/.test(option.value)).length, 63);
assert.equal(FLAT_DOMAIN_OPTIONS.some((option) => /^\d{2}\s/.test(option.label)), false);
assert.equal(PROBLEM_DOMAINS.length, 20);
assert.equal(PROBLEM_DOMAINS.some((option) => /^\d{2}-XX$/.test(option.value)), false);
assert.equal(PROBLEM_DOMAINS.some((option) => option.value === "algebraic-topology"), false);
assert.equal(new Set(FLAT_PROBLEM_DOMAIN_OPTIONS.map((option) => option.value)).size, FLAT_PROBLEM_DOMAIN_OPTIONS.length);
assert.equal(Object.keys(PROBLEM_DOMAIN_HERO_ART).length, PROBLEM_DOMAINS.length);
assert.equal(parseDomainCode("26"), "real-analysis");
assert.equal(parseDomainCode("52-XX"), "geometry");
assert.equal(parseDomainCode("GEOMETRY"), "geometry");
assert.equal(parseDomainCode("algebra-groups"), "algebra-groups");
assert.equal(domainLabel("algebra-groups"), "Groups");
assert.equal(coarseDomainForCode("algebra-groups"), MathDomain.ALGEBRA);
assert.equal(domainCodeAliases("algebra").includes("algebra-groups"), true);
assert.equal(parseDomainCode("algebraic-topology"), "topology-algebraic-topology");
assert.equal(parseDomainCode("55-XX"), "topology-algebraic-topology");
assert.equal(domainCodeAliases("general-topology").includes("algebraic-topology"), true);
assert.equal(domainLabel("general-topology"), "Topology");
assert.equal(translatedDomainLabel("algebra", { [MathDomain.ALGEBRA]: "Algèbre" }), "Algèbre");
assert.equal(translatedDomainLabel("algebra-groups", { [MathDomain.ALGEBRA]: "Algèbre" }), "Groups");
const algebraSubdomains = PROBLEM_DOMAINS.find((domain) => domain.value === "algebra")?.children ?? [];
assert.deepEqual(
  algebraSubdomains.map((domain) => domain.label),
  [...algebraSubdomains].map((domain) => domain.label).sort((left, right) => left.localeCompare(right, "en"))
);
assert.equal(domainLabel("26"), "Real analysis");
assert.equal(domainLabel("26-XX"), "Real analysis");
assert.equal(domainLabel("52-XX"), "Geometry");
assert.equal(heroArtForProblemDomain("60-XX").painting, "At the Edge of the Pine Forest");
assert.equal(heroArtForProblemDomain("46").painting, "Branches. A Study");
assert.equal(heroArtForProblemDomain("algebra-groups"), PROBLEM_DOMAIN_HERO_ART.algebra);
assert.equal(heroArtForProblemDomain(undefined), PROBLEM_DOMAIN_HERO_ART.other);
assert.deepEqual(parseProblemDomains(["11-XX", "26-XX"], null, ["26-XX"]), [
  { domain: "ARITHMETIC", mscCode: "number-theory", spoiler: false },
  { domain: "ANALYSIS", mscCode: "real-analysis", spoiler: true }
]);
assert.equal(tagsWithConjecture("algebra, conjecture", null), "algebra");
assert.equal(tagsWithConjecture("algebra", "on"), "algebra, conjecture");
assert.deepEqual(parseTagInput("easy, facile, linear algebra, vectors").map((tag) => tag.slug), [
  "linear-algebra",
  "vectors"
]);
assert.equal(qualityLabel(QualityStatus.NEEDS_WORK), "Needs work");
assert.equal(qualityLabel(QualityStatus.REVIEWED), "Reviewed");
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.USER), QualityStatus.UNREVIEWED);
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.MODERATOR), QualityStatus.UNREVIEWED);
assert.equal(parseContributorQualityStatus("EXCELLENT", Role.OWNER), QualityStatus.UNREVIEWED);
assert.equal(parseContributorQualityStatus("REVIEWED", Role.USER), QualityStatus.UNREVIEWED);
assert.equal(parseContributorQualityStatus("REVIEWED", Role.MODERATOR), QualityStatus.REVIEWED);
assert.equal(parseContributorQualityStatus("REVIEWED", Role.OWNER), QualityStatus.REVIEWED);
assert.equal(hasTrustedPrivileges(Role.USER), false);
assert.equal(hasTrustedPrivileges(Role.MODERATOR), true);
assert.equal(dailyContentCreationLimitForRole(Role.USER), 20);
assert.equal(dailyContentCreationLimitForRole(Role.MODERATOR), 100);
assert.equal(dailyContentCreationLimitForRole(Role.ADMIN), null);
assert.equal(dailyContentCreationLimitForRole(Role.OWNER), null);
assert.equal(
  contentCreationWindowStart(new Date("2026-07-20T18:00:00.000Z")).toISOString(),
  new Date(Date.parse("2026-07-20T18:00:00.000Z") - CONTENT_CREATION_WINDOW_MS).toISOString()
);
let quotaCreationCount = 19;
let quotaLockCount = 0;
let observedQuotaWhere: unknown;
const quotaTransaction = {
  $queryRaw: async () => {
    quotaLockCount += 1;
  },
  pageRevision: {
    count: async ({ where }: { where: unknown }) => {
      observedQuotaWhere = where;
      return quotaCreationCount;
    }
  }
} as unknown as Parameters<typeof assertDailyContentCreationQuota>[0];
await assertDailyContentCreationQuota(quotaTransaction, { id: 7, role: Role.USER }, new Date("2026-07-20T18:00:00.000Z"));
assert.equal(quotaLockCount, 1);
assert.deepEqual(observedQuotaWhere, {
  editedById: 7,
  isCreation: true,
  pageType: { in: ["PROBLEM", "CONCEPT"] },
  createdAt: { gte: new Date("2026-07-19T18:00:00.000Z") }
});
quotaCreationCount = 20;
await assert.rejects(
  () => assertDailyContentCreationQuota(quotaTransaction, { id: 7, role: Role.USER }),
  /up to 20 problems and concepts combined/
);
await assertDailyContentCreationQuota(
  {
    $queryRaw: async () => {
      throw new Error("Admins should bypass the daily quota.");
    }
  } as unknown as Parameters<typeof assertDailyContentCreationQuota>[0],
  { id: 8, role: Role.ADMIN }
);
assert.equal(canUseModerationTools(Role.MODERATOR), true);
assert.equal(canUseAdminTools(Role.MODERATOR), false);
assert.equal(canUseAdminTools(Role.ADMIN), true);
assert.equal(shouldNotifyAdminsOfContributorCreation(Role.USER), true);
assert.equal(shouldNotifyAdminsOfContributorCreation(Role.MODERATOR), true);
assert.equal(shouldNotifyAdminsOfContributorCreation(Role.ADMIN), false);
assert.equal(shouldNotifyAdminsOfContributorCreation(Role.OWNER), false);
assert.deepEqual(
  problemEditNotificationRecipientIds({ authorId: 1, participantIds: [1, 2, 2, 3], actorId: 2 }),
  [1, 3]
);
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
assert.equal(canSetProblemQualityStatus(Role.USER, QualityStatus.REVIEWED), false);
assert.equal(canSetProblemQualityStatus(Role.MODERATOR, QualityStatus.REVIEWED), true);
assert.equal(canSetProblemQualityStatus(Role.ADMIN, QualityStatus.REVIEWED), true);
assert.equal(canReviewProblem({ id: 1, role: Role.MODERATOR }, { authorId: 1 }), false);
assert.equal(canReviewProblem({ id: 1, role: Role.MODERATOR }, { authorId: 2 }), true);
assert.equal(canReviewProblem({ id: 1, role: Role.USER }, { authorId: 2 }), false);
assert.equal(canSetConceptStatus(Role.MODERATOR, ConceptStatus.REVIEWED), true);
assert.equal(canSetConceptStatus(Role.MODERATOR, ConceptStatus.EXCELLENT), false);
assert.equal(canSetConceptStatus(Role.ADMIN, ConceptStatus.EXCELLENT), true);
assert.equal(canReviewConcept({ id: 1, role: Role.MODERATOR }, { createdById: 1 }), false);
assert.equal(canReviewConcept({ id: 1, role: Role.MODERATOR }, { createdById: 2 }), true);
assert.equal(canReviewConcept({ id: 1, role: Role.USER }, { createdById: 2 }), false);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.MODERATOR },
    { createdById: 1, status: ConceptStatus.STUB },
    ConceptStatus.USABLE
  ),
  true
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.USER },
    { createdById: 1, status: ConceptStatus.STUB },
    ConceptStatus.USABLE
  ),
  false
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.MODERATOR },
    { createdById: 1, status: ConceptStatus.STUB },
    ConceptStatus.REVIEWED
  ),
  false
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.MODERATOR },
    { createdById: 2, status: ConceptStatus.STUB },
    ConceptStatus.REVIEWED
  ),
  false
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.MODERATOR },
    { createdById: 2, status: ConceptStatus.USABLE },
    ConceptStatus.REVIEWED
  ),
  true
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.MODERATOR },
    { createdById: 1, status: ConceptStatus.REVIEWED },
    ConceptStatus.REVIEWED
  ),
  true
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.ADMIN },
    { createdById: 1, status: ConceptStatus.REVIEWED },
    ConceptStatus.EXCELLENT
  ),
  false
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.ADMIN },
    { createdById: 2, status: ConceptStatus.REVIEWED },
    ConceptStatus.EXCELLENT
  ),
  true
);
assert.equal(isVerifiedContributor({ id: 1, role: Role.USER, emailVerifiedAt: null }), false);
assert.equal(isVerifiedContributor({ id: 1, role: Role.USER, emailVerifiedAt: new Date(0) }), true);
assert.equal(isVerifiedContributor({ id: 1, role: Role.MODERATOR, emailVerifiedAt: null }), true);
assert.equal(canEditProblem({ id: 1, role: Role.USER }, { authorId: 1 }), true);
assert.equal(canEditProblem({ id: 1, role: Role.USER }, { authorId: 2 }), false);
assert.equal(canEditProblem({ id: 1, role: Role.MODERATOR }, { authorId: 2 }), true);
assert.equal(canDeletePlaylist({ id: 1, role: Role.USER }, { authorId: 1 }), true);
assert.equal(canDeletePlaylist({ id: 1, role: Role.USER }, { authorId: 2 }), false);
assert.equal(canDeletePlaylist({ id: 1, role: Role.ADMIN }, { authorId: 2 }), true);
assert.equal(canManageUserRoles(Role.ADMIN), false);
assert.equal(canManageUserRoles(Role.OWNER), true);
assert.equal(headingLevel("ATXHeading3"), 3);
assert.equal(headingLevel("Paragraph"), null);
assert.equal(markdownPreviewClass("StrongEmphasis"), "cm-md-strong");
assert.equal(markdownHeadingLineText("Existing title", 4), "#### Existing title");
assert.equal(markdownHeadingLineText("## Existing title", 4), "#### Existing title");
assert.equal(markdownHeadingLineText("", 5), "##### ");
assert.equal(markdownHeadingPreviewText("##### "), null);
assert.equal(markdownHeadingPreviewText("##### Title"), "Title");
const latexPreferenceModel = Prisma.dmmf.datamodel.models.find((model) => model.name === "LatexPreference");
assert.ok(latexPreferenceModel, "Prisma must expose the LatexPreference model");
type PrismaDmmfField = (typeof Prisma.dmmf.datamodel.models)[number]["fields"][number];
for (const [fieldName, expectedDefault] of Object.entries(DEFAULT_MARKDOWN_HEADING_SHORTCUTS)) {
  const field: PrismaDmmfField | undefined = latexPreferenceModel.fields.find(
    (candidate) => candidate.name === fieldName
  );
  assert.ok(field, `LatexPreference.${fieldName} must exist`);
  assert.equal(field.hasDefaultValue, true, `LatexPreference.${fieldName} must have a database default`);
  assert.equal(
    field.default,
    expectedDefault,
    `LatexPreference.${fieldName} must match DEFAULT_MARKDOWN_HEADING_SHORTCUTS`
  );
}
assert.equal(
  keyboardEventMatchesShortcut(
    { altKey: false, ctrlKey: false, metaKey: false, shiftKey: true, code: "Digit4", key: "$" },
    "Shift+4"
  ),
  true
);
assert.equal(
  markdownHeadingLevelForEvent(
    { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false, code: "Digit6", key: "6" },
    DEFAULT_MARKDOWN_HEADING_SHORTCUTS
  ),
  6
);
assert.equal(
  markdownHeadingLevelForEvent(
    { altKey: false, ctrlKey: false, metaKey: false, shiftKey: true, code: "Digit4", key: "$" },
    DEFAULT_MARKDOWN_HEADING_SHORTCUTS
  ),
  null
);
assert.equal(latexEditorPreferencesFromApi({ autocloseDollars: false }).autocloseDollars, false);
assert.deepEqual(parseLatexCustomCommands("RR => \\mathbb{R}\n% ignored\nbad line"), [
  { trigger: "RR", replacement: "\\mathbb{R}" }
]);
assert.deepEqual(latexTextInputShortcut("Let ", 4, 4, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 4, to: 4, insert: "$$" },
  anchor: 5,
  skipDisplayMathLineBreakNormalization: true
});
assert.deepEqual(latexTextInputShortcut("Before after\n$$y$$", 7, 7, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 7, to: 7, insert: "$$" },
  anchor: 8,
  skipDisplayMathLineBreakNormalization: true
});
assert.deepEqual(latexTextInputShortcut("Let x", 4, 5, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 4, to: 5, insert: "$x$" },
  anchor: 7
});
assert.deepEqual(latexTextInputShortcut("$", 1, 1, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 1, to: 1, insert: "$$" },
  anchor: 2,
  skipDisplayMathLineBreakNormalization: true
});
assert.deepEqual(latexTextInputShortcut("$$", 1, 1, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 1, to: 1, insert: "$$" },
  anchor: 2
});
const previewFocusEffect = StateEffect.define<boolean>();
const displayMathNormalizer = createDisplayMathLineBreakNormalizer(previewFocusEffect);
const inlineAutocloseState = EditorState.create({
  doc: "Before after\n$$y$$",
  extensions: [displayMathNormalizer]
});
const inlineAutocloseTransaction = inlineAutocloseState.update({
  changes: { from: 7, to: 7, insert: "$$" },
  selection: { anchor: 8 },
  annotations: skipDisplayMathLineBreakNormalization.of(true)
});
assert.equal(inlineAutocloseTransaction.newDoc.toString(), "Before $$after\n$$y$$");
const genuineDisplayState = EditorState.create({
  doc: "Before $$$$ after",
  extensions: [displayMathNormalizer]
});
const genuineDisplayTransaction = genuineDisplayState.update({
  changes: { from: 9, to: 9, insert: "x" },
  selection: { anchor: 10 }
});
assert.equal(genuineDisplayTransaction.newDoc.toString(), "Before\n$$x$$\nafter");
assert.deepEqual(latexTextInputShortcut("`code ", 6, 6, "$", DEFAULT_LATEX_PREFERENCES), null);
assert.deepEqual(latexTextInputShortcut("$x$", 2, 2, "^", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 2, to: 2, insert: "^{}" },
  anchor: 4
});
assert.deepEqual(latexTextInputShortcut("$12$", 3, 3, "/", { ...DEFAULT_LATEX_PREFERENCES, slashFractions: true }), {
  changes: { from: 1, to: 3, insert: "\\frac{12}{}" },
  anchor: 11
});
assert.deepEqual(latexTextInputShortcut("$\\sum$", 5, 5, " ", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 1, to: 5, insert: "\\sum\\limits " },
  anchor: 13
});
assert.deepEqual(latexTextInputShortcut("\\alpha", 6, 6, " ", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 0, to: 6, insert: "$\\alpha$ " },
  anchor: 9
});
assert.deepEqual(latexTabShortcut("$RR$", 3, { ...DEFAULT_LATEX_PREFERENCES, tabCompletesShorthand: true }), {
  changes: { from: 1, to: 3, insert: "\\mathbb{R}" },
  anchor: 11
});
assert.deepEqual(latexInlineMathShortcut("abc", 1, 2, DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 1, to: 2, insert: "$b$" },
  anchor: 4
});
assert.deepEqual(latexDisplayMathShortcut("abc", 1, 2, DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 1, to: 2, insert: "\n\n$$\nb\n$$\n\n" },
  anchor: 10
});
assert.deepEqual(latexAlignShortcut("x=1\ny>2", 0, 7, DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 0, to: 7, insert: "$$\n\\begin{align*}\nx&=1 \\\\\ny&>2\n\\end{align*}\n$$" },
  anchor: 30
});
assert.deepEqual(latexMatrixShortcut("", 0, 0, { ...DEFAULT_LATEX_PREFERENCES, matrixEnvironment: "bmatrix" }), {
  changes: { from: 0, to: 0, insert: "$$\n\\begin{bmatrix}\n \n\\end{bmatrix}\n$$" },
  anchor: 19
});
assert.deepEqual(
  latexShiftEnterShortcut("$$\n\\begin{align*}\n& x=1\n\\end{align*}\n$$", 23, {
    ...DEFAULT_LATEX_PREFERENCES,
    shiftEnterLineBreaks: true
  }),
  {
    changes: { from: 23, to: 23, insert: " \\\\\n& " },
    anchor: 29
  }
);
assert.deepEqual(
  latexKeyboardShortcut("abc", 1, 2, { altKey: false, ctrlKey: true, metaKey: false, shiftKey: false, key: "m" }, DEFAULT_LATEX_PREFERENCES),
  {
    changes: { from: 1, to: 2, insert: "$b$" },
    anchor: 4
  }
);
assert.deepEqual(findWikiLinkRanges("See [[polynomial]] and [[vieta-relations|Vieta]]."), [
  { from: 4, to: 18, label: "polynomial" },
  { from: 23, to: 48, label: "Vieta" }
]);
assert.deepEqual(findWikiLinkRanges("Code `[[skip]]` then [[polynomial]]."), [
  { from: 21, to: 35, label: "polynomial" }
]);
assert.deepEqual(findProblemLinkRanges("See [this problem](/problems/finite-groups)."), [
  { from: 5, to: 17 }
]);
assert.deepEqual(findProblemLinkRanges("Code `[skip](/problems/skip)` then [open](/problems/finite-groups)."), [
  { from: 36, to: 40 }
]);
const wikiLinkBoundaryText = "See [[Eulerian path|eulerian path]] now";
const wikiLinkBoundaryFrom = wikiLinkBoundaryText.indexOf("[[");
const wikiLinkBoundaryTo = wikiLinkBoundaryText.indexOf("]]", wikiLinkBoundaryFrom) + 2;
assert.deepEqual(wikiLinkDeleteChange(wikiLinkBoundaryText, wikiLinkBoundaryTo, "backward"), {
  from: wikiLinkBoundaryTo - 1,
  to: wikiLinkBoundaryTo,
  anchor: wikiLinkBoundaryTo - 1
});
assert.deepEqual(wikiLinkDeleteChange(wikiLinkBoundaryText, wikiLinkBoundaryFrom, "forward"), {
  from: wikiLinkBoundaryFrom,
  to: wikiLinkBoundaryFrom + 1,
  anchor: wikiLinkBoundaryFrom
});
assert.equal(wikiLinkDeleteChange(wikiLinkBoundaryText, wikiLinkBoundaryTo + 1, "backward"), null);
const codedWikiLink = "Code `[[Eulerian path]]`";
const codedWikiLinkBoundary = codedWikiLink.indexOf("]]", codedWikiLink.indexOf("[[")) + 2;
assert.equal(wikiLinkDeleteChange(codedWikiLink, codedWikiLinkBoundary, "backward"), null);

const renderedLatex = await renderMarkdown(
  "A real sequence $(u_n)_{n\\geq 0}$ satisfies $u_{n+1}=u_n$ for every $n\\geq 0$."
);
assert.equal(renderedLatex.includes("u_{n+1}=u_n"), true);
assert.equal(renderedLatex.includes("<em>{n\\geq 0}</annotation>"), false);

const renderedItalicAfterLatex = await renderMarkdown(
  "*Dans le cas* $n_1$*, correspondant à la gamme chromatique usuelle.*"
);
assert.equal(renderedItalicAfterLatex.includes("*, correspondant"), false);
assert.equal(renderedItalicAfterLatex.includes("<em>, correspondant"), true);

const renderedBackslashLatex = await renderMarkdown("Let \\(x^2\\) and \\[y=x+1\\].");
assert.equal(renderedBackslashLatex.includes("x^2"), true);
assert.equal(renderedBackslashLatex.includes("y=x+1"), true);

const renderedMixedDisplayLatex = await renderMarkdown("Before $$x^2 + 1$$ after");
assert.match(renderedMixedDisplayLatex, /<p>Before\s*<\/p>\s*<p><span class="katex-display"/);
assert.match(renderedMixedDisplayLatex, /<\/span><\/p>\s*<p>\s*after<\/p>/);
assert.equal(/<p>Before\s*<span class="katex-display"/.test(renderedMixedDisplayLatex), false);

const renderedStandaloneDisplayLatex = await renderMarkdown("Before\n$$x^2 + 1$$\nafter");
assert.match(renderedStandaloneDisplayLatex, /Before<br \/><span class="katex-display"/);
assert.equal(renderedStandaloneDisplayLatex.includes("<br />after"), false);
assert.match(renderedStandaloneDisplayLatex, /<\/span>after<\/p>\s*$/);

const renderedInlineDisplayLatex = await renderInlineMarkdown("Title $$x^2 + 1$$");
assert.match(renderedInlineDisplayLatex, /^Title <span class="katex-display"/);

assert.equal(
  markdownFoldBlock("Selected text"),
  `:::fold ${DEFAULT_MARKDOWN_FOLD_TITLE}\nSelected text\n:::`
);
const extractedFold = extractMarkdownFolds("Before\n\n:::fold A hint\nUse $x^2$.\n:::\n\nAfter");
assert.equal(extractedFold.folds.length, 1);
assert.equal(extractedFold.folds[0].title, "A hint");
assert.equal(extractedFold.folds[0].body, "Use $x^2$.");
assert.equal(extractedFold.markdown.includes(":::fold"), false);

const renderedFold = await renderMarkdown(`Before

:::fold **See the hint**
Use $x^2$ and [[group]].

- First
- Second
:::

After`);
assert.match(renderedFold, /<details class="markdown-fold">/);
assert.match(renderedFold, /<summary><strong>See the hint<\/strong><\/summary>/);
assert.match(renderedFold, /<div class="markdown-fold-body">/);
assert.match(renderedFold, /class="katex"/);
assert.match(renderedFold, /href="\/concepts\/group"/);
assert.match(renderedFold, /<ul>/);
assert.equal(renderedFold.includes(":::fold"), false);

const renderedFoldWithFence = await renderMarkdown(`:::fold Code example
\`\`\`
:::
\`\`\`
Still inside the fold.
:::`);
assert.match(renderedFoldWithFence, /<details class="markdown-fold">/);
assert.match(renderedFoldWithFence, /<code>:::\n<\/code>/);
assert.match(renderedFoldWithFence, /Still inside the fold/);

const renderedFoldInCode = await renderMarkdown("```\n:::fold Not a fold\nBody\n:::\n```");
assert.equal(renderedFoldInCode.includes('<details class="markdown-fold">'), false);
assert.match(renderedFoldInCode, /:::fold Not a fold/);

const renderedUnclosedFold = await renderMarkdown(":::fold Open\nBody");
assert.equal(renderedUnclosedFold.includes('<details class="markdown-fold">'), false);
assert.match(renderedUnclosedFold, /:::fold Open/);

const renderedInlineFold = await renderInlineMarkdown(":::fold Inline\nBody\n:::");
assert.equal(renderedInlineFold.includes('<details class="markdown-fold">'), false);

const renderedLatexList = await renderMarkdown(String.raw`\begin{itemize}
\item Either $z$ is a complex eigenvalue.
\item Or all eigenvalues are real.
\end{itemize}`);
assert.equal(renderedLatexList.includes("<ul>"), true);
assert.equal(renderedLatexList.includes("<li>Either"), true);
assert.equal(renderedLatexList.includes("z"), true);

const renderedOrderedListStart = await renderMarkdown("1. First\n\n- Aside\n\n4. Fourth");
assert.equal(renderedOrderedListStart.includes('<ol start="4">'), true);

assert.deepEqual(findMarkdownQuestionMarkers("1) Question\n2)a) Subquestion\n`3)b) Code`"), [
  {
    primaryFrom: 0,
    primaryTo: 2,
    secondaryFrom: null,
    secondaryTo: null,
    compact: false
  },
  {
    primaryFrom: 12,
    primaryTo: 14,
    secondaryFrom: 14,
    secondaryTo: 16,
    compact: true
  }
]);
assert.equal(
  normalizeMarkdownQuestionMarkers("1)a) First subquestion\n2) b) Second subquestion"),
  "1) **a)** First subquestion\n2) **b)** Second subquestion"
);
assert.equal(
  normalizeMarkdownQuestionMarkers("1)\na) Separate line"),
  "1)\na) Separate line"
);
const renderedExerciseQuestions = await renderMarkdown("1) Question\n2)a) Subquestion");
assert.match(renderedExerciseQuestions, /<ol>[\s\S]*<li>Question<\/li>/);
assert.match(renderedExerciseQuestions, /<li><strong>a\)<\/strong> Subquestion<\/li>/);

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
const renderedTranslatedWikiLink = await renderMarkdown(
  "See [[polynomial]].",
  new Set(),
  true,
  (link) => `/concepts/fr-${link.targetSlug}`
);
assert.equal(renderedTranslatedWikiLink.includes('href="/concepts/fr-polynomial"'), true);
assert.equal(renderedTranslatedWikiLink.includes("markdown-problem-link"), false);
const renderedProblemLink = await renderMarkdown(problemLinkMarkup("finite-groups", "this problem"));
assert.equal(renderedProblemLink.includes('href="/problems/finite-groups"'), true);
assert.equal(renderedProblemLink.includes('class="markdown-problem-link"'), true);

const renderedUnsafeMarkdown = await renderMarkdown("<script>alert(1)</script><img src=x onerror=alert(1)>");
assert.equal(renderedUnsafeMarkdown.includes("<script"), false);
assert.equal(renderedUnsafeMarkdown.includes("onerror"), false);
assert.equal(renderedUnsafeMarkdown.includes("<img"), false);

const renderedUnsafeLink = await renderMarkdown("[bad](javascript:alert(1))");
assert.equal(renderedUnsafeLink.includes('href="javascript:'), false);

const parsedGraph = parseJsxGraphConfig(JSON.stringify({
  boundingBox: [-4, 4, 4, -4],
  axis: true,
  elements: [
    { id: "a", type: "slider", parents: [[-3, 3], [1, 3], [0, 1, 2]], attributes: { name: "a" } },
    { type: "functiongraph", parents: ["a*x^2"], attributes: { strokeColor: "#2f6f4e" } }
  ],
  animation: { target: "a", steps: 90, delay: 40, rounds: 2 }
}));
assert.equal(parsedGraph.ok, true);
if (parsedGraph.ok) {
  const decodedGraph = decodeJsxGraphConfig(encodeJsxGraphConfig(parsedGraph.config));
  assert.deepEqual(decodedGraph, parsedGraph);
}

const renderedGraph = await renderMarkdown(`\`\`\`jsxgraph
{
  "axis": true,
  "elements": [{ "id": "A", "type": "point", "parents": [1, 2], "attributes": { "name": "A" } }]
}
\`\`\``);
assert.match(renderedGraph, /class="jsxgraph-embed"/);
assert.match(renderedGraph, /data-jsxgraph="[^"]+"/);
assert.equal(renderedGraph.includes('"parents"'), false);

const rejectedGraph = parseJsxGraphConfig(JSON.stringify({
  elements: [{ type: "text", parents: [0, 0, "<script>alert(1)</script>"], attributes: {} }]
}));
assert.equal(rejectedGraph.ok, false);
const renderedRejectedGraph = await renderMarkdown(`\`\`\`jsxgraph
{"elements":[{"type":"text","parents":[0,0,"bad"],"attributes":{}}]}
\`\`\``);
assert.match(renderedRejectedGraph, /Graph could not be rendered/);
assert.equal(renderedRejectedGraph.includes("data-jsxgraph"), false);

const renderedMarkdownImage = await renderMarkdown("![diagram](https://images.mathwoods.org/uploads/diagram.png)");
assert.equal(renderedMarkdownImage.includes('<img src="https://images.mathwoods.org/uploads/diagram.png"'), true);
assert.equal(renderedMarkdownImage.includes('alt="diagram"'), true);
assert.equal(renderedMarkdownImage.includes('loading="lazy"'), true);

const renderedUnsafeMarkdownImage = await renderMarkdown("![bad](javascript:alert(1))");
assert.equal(renderedUnsafeMarkdownImage.includes("<img"), false);

const renderedExternalLink = await renderMarkdown("[external](https://example.com)");
assert.equal(renderedExternalLink.includes('href="https://example.com"'), true);
assert.equal(renderedExternalLink.includes('rel="noopener noreferrer nofollow ugc"'), true);
assert.equal(renderedExternalLink.includes('target="_blank"'), true);

const renderedProtocolRelativeLink = await renderMarkdown("[external](//example.com/path)");
assert.equal(renderedProtocolRelativeLink.includes('href="//example.com/path"'), false);

function tsxFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.isFile() && path.endsWith(".tsx") ? [path] : [];
  });
}

const labelsWrappingMarkdownEditor = tsxFiles("app").flatMap((path) => {
  const source = readFileSync(path, "utf-8");
  return [...source.matchAll(/<label\b[\s\S]*?<\/label>/g)]
    .filter((match) => /MarkdownEditor|LazyMarkdownEditor/.test(match[0]))
    .map(() => path);
});
assert.deepEqual(labelsWrappingMarkdownEditor, []);
const editorCssSource = readFileSync(join("app", "globals.css"), "utf-8");
const latexDisplayRule = editorCssSource.match(/\.markdown-editor \.cm-latex-display \{([^}]*)\}/)?.[1] ?? "";
assert.match(latexDisplayRule, /display:\s*inline-block/);
assert.doesNotMatch(latexDisplayRule, /display:\s*block/);
assert.doesNotMatch(latexDisplayRule, /overflow-x:\s*auto/);
assert.match(editorCssSource, /\.markdown-editor \.cm-latex-display-line \{\s*text-align:\s*center;/);
assert.match(editorCssSource, /\.prose-math \.katex-display \{\s*margin:\s*0\.4em 0;/);

assert.equal(sanitizeReportPath("/edit?token=secret#draft"), "/edit");
assert.equal(sanitizeReportPath("https://mathwoods.org/problem/one?email=a@example.com"), "https://mathwoods.org/problem/one");

const legacyExplorationPages = explorationSnapshotPages({
  pages: [
    { id: 1, key: "first", position: 1, blocks: [] },
    { id: 2, key: "last", position: 2, blocks: [] }
  ]
});
assert.deepEqual(legacyExplorationPages.map((page) => page.isEnd), [false, true]);

const configuredExplorationPages = explorationSnapshotPages({
  pages: [
    { id: 1, key: "first", position: 1, isEnd: true, blocks: [] },
    { id: 2, key: "last", position: 2, isEnd: false, blocks: [] }
  ]
});
assert.deepEqual(configuredExplorationPages.map((page) => page.isEnd), [true, false]);

const readableExplorationPages = new Set([1, 2, 3]);
assert.equal(hasReachableExplorationExit({ continueToPageId: null, choiceTargetPageIds: [], readablePageIds: readableExplorationPages }), false);
assert.equal(hasReachableExplorationExit({ continueToPageId: 2, choiceTargetPageIds: [], readablePageIds: readableExplorationPages }), true);
assert.equal(hasReachableExplorationExit({ continueToPageId: 4, choiceTargetPageIds: [], readablePageIds: readableExplorationPages }), false);
assert.equal(hasReachableExplorationExit({ continueToPageId: null, choiceTargetPageIds: [null, 3], readablePageIds: readableExplorationPages }), true);

assert.equal(guestProgressContentKey("/problems/group-action", new URLSearchParams()), "problems:group-action");
assert.equal(guestProgressContentKey("/concepts/group", new URLSearchParams()), "concepts:group");
assert.equal(guestProgressContentKey("/problems/new", new URLSearchParams()), null);
assert.equal(guestProgressContentKey("/concepts/group/edit", new URLSearchParams()), null);
assert.equal(parseOAuthProvider("google"), "google");
assert.equal(parseOAuthProvider("orcid"), "orcid");
assert.equal(parseOAuthProvider("github"), "github");
assert.equal(parseOAuthProvider("unknown"), null);
assert.equal(selectVerifiedGithubEmail([
  { email: "secondary@example.com", primary: false, verified: true },
  { email: "Primary@Example.com", primary: true, verified: true }
]), "primary@example.com");
assert.equal(selectVerifiedGithubEmail([
  { email: "unverified@example.com", primary: true, verified: false },
  { email: "verified@example.com", primary: false, verified: true }
]), "verified@example.com");
assert.equal(selectVerifiedGithubEmail([{ email: "unverified@example.com", primary: true, verified: false }]), null);
assert.equal(safeReturnTo("/explorations/geometry/start"), "/explorations/geometry/start");
assert.equal(safeReturnTo("https://malicious.example"), "/");
assert.equal(safeReturnTo("//malicious.example"), "/");
assert.equal(safeReturnTo("/\\malicious.example"), "/");
assert.equal(safeReturnTo(null, "/settings"), "/settings");
assert.equal(
  guestProgressContentKey("/explorations/space-rotations/start", new URLSearchParams("block=groups")),
  "exploration:space-rotations:groups"
);

const staleChunkError = new Error(
  "Loading chunk 7330 failed. (error: https://mathwoods.org/_next/static/chunks/d3ac728e-652fe3530429dda0.js)"
);
staleChunkError.name = "ChunkLoadError";
assert.equal(isChunkLoadError(staleChunkError), true);
assert.equal(
  chunkLoadErrorSignature(staleChunkError),
  "https://mathwoods.org/_next/static/chunks/d3ac728e-652fe3530429dda0.js"
);
assert.equal(isChunkLoadError(new Error("Ordinary render failure")), false);

const imageKeyDate = new Date("2026-07-01T12:00:00.000Z");
assert.equal(
  buildAvatarObjectKey({
    userId: 7,
    now: imageKeyDate,
    randomSuffix: "abc123"
  }),
  `avatars/user-7/${imageKeyDate.getTime()}-abc123.webp`
);
assert.equal(
  buildImageObjectKey({
    userId: 7,
    filename: "Jolie equation finale.png",
    contentType: "image/webp",
    now: imageKeyDate,
    randomSuffix: "abc123"
  }),
  `uploads/2026/07/user-7/${imageKeyDate.getTime()}-abc123-jolie-equation-finale.webp`
);
assert.equal(
  buildChatImageObjectKey({
    userId: 7,
    now: imageKeyDate,
    randomSuffix: "private123"
  }),
  `chat/2026/07/user-7/${imageKeyDate.getTime()}-private123.webp`
);
assert.equal(chatImageDailyLimitForRole(Role.USER), 20);
assert.equal(chatImageDailyLimitForRole(Role.MODERATOR), 100);
assert.equal(chatImageDailyLimitForRole(Role.ADMIN), Number.POSITIVE_INFINITY);
assert.equal(chatImageUrl("Ada Lovelace", 42, true), "/api/chat/Ada%20Lovelace/messages/42");
assert.equal(chatImageUrl("Ada Lovelace", 42, false), null);
assert.deepEqual(validateImageUploadInput({ filename: "diagram.png", contentType: "image/png", sizeBytes: 42 }), {
  filename: "diagram.png",
  contentType: "image/png",
  sizeBytes: 42
});
assert.throws(() => validateImageUploadInput({ filename: "diagram.svg", contentType: "image/svg+xml", sizeBytes: 42 }));

const testImageStorageConfig: ImageStorageConfig = {
  endpoint: new URL("https://s3.example.test"),
  region: "dc-test",
  bucket: "mathwoods-images",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
  publicBaseUrl: new URL("https://images.mathwoods.org"),
  pathStyle: true
};
const presignedUpload = createPresignedImageUpload(
  testImageStorageConfig,
  "uploads/2026/07/user-7/example.webp",
  "image/webp",
  imageKeyDate
);
const presignedDownload = createPresignedImageDownload(
  testImageStorageConfig,
  "chat/2026/07/user-7/private.webp",
  imageKeyDate
);
assert.equal(presignedUpload.method, "PUT");
assert.match(presignedDownload.url, /^https:\/\/s3\.example\.test\/mathwoods-images\/chat\/2026\/07\/user-7\/private\.webp\?/);
assert.match(presignedDownload.url, /X-Amz-Signature=/);
assert.equal(
  imageObjectKeyFromPublicUrl(testImageStorageConfig, "https://images.mathwoods.org/avatars/user-7/example.webp"),
  "avatars/user-7/example.webp"
);
assert.equal(imageObjectKeyFromPublicUrl(testImageStorageConfig, "https://malicious.example/avatar.webp"), null);
assert.equal(normalizeTipImageUrl(" /art/oak-grove.jpg "), "/art/oak-grove.jpg");
assert.equal(normalizeTipImageUrl("https://images.example.org/tip.png"), "https://images.example.org/tip.png");
assert.equal(normalizeTipImageUrl(""), null);
assert.throws(() => normalizeTipImageUrl("http://images.example.org/tip.png"));
assert.throws(() => normalizeTipImageUrl("//images.example.org/tip.png"));
assert.equal(tipImageUrl(null), DEFAULT_TIP_IMAGE_URL);
assert.equal(tipImageUrl("https://images.example.org/tip.png"), "https://images.example.org/tip.png");
assert.equal(normalizeTipImagePosition(undefined), DEFAULT_TIP_IMAGE_POSITION);
assert.equal(normalizeTipImagePosition(null), DEFAULT_TIP_IMAGE_POSITION);
assert.equal(normalizeTipImagePosition("72.4"), 72);
assert.equal(normalizeTipImagePosition(-10), 0);
assert.equal(normalizeTipImagePosition(140), 100);
assert.equal(tipImageObjectPosition(25, 80), "25% 80%");
const presignedDelete = createPresignedImageDelete(
  testImageStorageConfig,
  "avatars/user-7/example.webp",
  imageKeyDate
);
assert.equal(presignedDelete.method, "DELETE");
assert.equal(presignedUpload.headers["Cache-Control"], "public, max-age=31536000, immutable");
assert.equal(presignedUpload.publicUrl, "https://images.mathwoods.org/uploads/2026/07/user-7/example.webp");
assert.match(presignedUpload.url, /^https:\/\/s3\.example\.test\/mathwoods-images\/uploads\/2026\/07\/user-7\/example\.webp\?/);
assert.match(presignedUpload.url, /X-Amz-Signature=/);

assert.equal(parseExplorationValue("true"), true);
assert.equal(parseExplorationValue("42"), 42);
assert.equal(
  conditionMatches(
    { all: [{ variable: "quiz.basics.correct", operator: "equals", value: true }, { variable: "score", operator: "gte", value: 2 }] },
    { "quiz.basics.correct": true, score: 3 }
  ),
  true
);
assert.equal(conditionMatches({ variable: "topics", operator: "contains", value: "groups" }, { topics: ["groups", "rings"] }), true);
assert.deepEqual(
  applyEffects(
    { score: 2, topics: ["groups"] },
    [
      { variable: "score", operation: "increment", value: 3 },
      { variable: "topics", operation: "append", value: "rings" },
      { variable: "needsReview", operation: "set", value: true }
    ]
  ),
  { score: 5, topics: ["groups", "rings"], needsReview: true }
);
assert.equal(numericAnswerMatches("3,1416", 3.14, 0.01), true);
assert.equal(numericAnswerMatches("3.2", 3.14, 0.01), false);

const quizOutcomes = [
  { id: 1, kind: "CORRECT" as const, optionIds: [], position: 1, toPageId: 10 },
  { id: 2, kind: "INCORRECT" as const, optionIds: [], position: 2, toPageId: 11 },
  { id: 3, kind: "COMBINATION" as const, optionIds: [4, 2], position: 3, toPageId: 12 },
  { id: 4, kind: "ANSWER" as const, optionIds: [7], position: 4, toPageId: 13 }
];
assert.equal(resolveExplorationQuizOutcome(quizOutcomes, [2, 4], true)?.id, 3);
assert.equal(resolveExplorationQuizOutcome(quizOutcomes, [7], false)?.id, 4);
assert.equal(resolveExplorationQuizOutcome(quizOutcomes, [8], true)?.id, 1);
assert.equal(resolveExplorationQuizOutcome(quizOutcomes, [8], false)?.id, 2);
assert.equal(resolveExplorationQuizOutcome([], [8], false), null);
assert.deepEqual(
  [...reachableExplorationPageIds([
    { id: 1, isStart: true, targetPageIds: [2] },
    { id: 2, isStart: false, targetPageIds: [1] },
    { id: 3, isStart: false, targetPageIds: [] }
  ])],
  [1, 2]
);
assert.equal(nextExplorationBlockId(9, 8, 7), 9);
assert.equal(nextExplorationBlockId(null, 8, 7), 8);
assert.equal(nextExplorationBlockId(null, null, 7), 7);
assert.deepEqual(explorationPathAfter([1, 2, 3], 1, 4), [1, 2, 4]);
assert.deepEqual(explorationPathAfter([1], 0, 2), [1, 2]);
assert.equal(canAutomaticallyAdvance([1, 2], 3), true);
assert.equal(canAutomaticallyAdvance([1, 2], 1), false);
const folderedBlocks = [
  { id: 1, folderId: null, label: "Loose" },
  { id: 2, folderId: 20, label: "Second folder" },
  { id: 3, folderId: 10, label: "First folder" },
  { id: 4, folderId: 10, label: "First folder tail" }
];
assert.deepEqual(orderExplorationBlocksByFolders(folderedBlocks, [10, 20]).map((block) => block.id), [1, 3, 4, 2]);
const movedIntoFolder = moveExplorationBlockToFolder(folderedBlocks, [10, 20], 1, 10, 1);
assert.deepEqual(movedIntoFolder.map((block) => block.id), [3, 1, 4, 2]);
assert.equal(movedIntoFolder.find((block) => block.id === 1)?.folderId, 10);
const movedBackToUnsorted = moveExplorationBlockToFolder(movedIntoFolder, [10, 20], 4, null, 0);
assert.deepEqual(movedBackToUnsorted.map((block) => block.id), [4, 3, 1, 2]);
assert.equal(movedBackToUnsorted.find((block) => block.id === 4)?.folderId, null);
const explorationFolders = [{ id: 10 }, { id: 20 }, { id: 30 }];
assert.deepEqual(moveExplorationBlockFolder(explorationFolders, 30, 10, "before").map((folder) => folder.id), [30, 10, 20]);
assert.deepEqual(moveExplorationBlockFolder(explorationFolders, 10, 20, "after").map((folder) => folder.id), [20, 10, 30]);
const reorderedFolders = moveExplorationBlockFolder(explorationFolders, 20, 10, "before");
assert.deepEqual(
  orderExplorationBlocksByFolders(folderedBlocks, reorderedFolders.map((folder) => folder.id)).map((block) => block.id),
  [1, 2, 3, 4]
);
const quizOptions = [
  { id: 1, isCorrect: true },
  { id: 2, isCorrect: false },
  { id: 3, isCorrect: true }
];
assert.deepEqual(evaluateExplorationQuizSelection(quizOptions, [1, 3]), { failedOptionIds: [], isCorrect: true });
assert.deepEqual(evaluateExplorationQuizSelection(quizOptions, [1, 2]), { failedOptionIds: [2, 3], isCorrect: false });
assert.deepEqual(evaluateExplorationQuizSelection(quizOptions, []), { failedOptionIds: [1, 3], isCorrect: false });
assert.deepEqual(
  [...reachableExplorationBlockIds([
    { id: 1, isStart: true, continueToBlockId: 2, optionTargetBlockIds: [], outcomeTargetBlockIds: [] },
    { id: 2, isStart: false, continueToBlockId: null, optionTargetBlockIds: [3, 4], outcomeTargetBlockIds: [] },
    { id: 3, isStart: false, continueToBlockId: 5, optionTargetBlockIds: [], outcomeTargetBlockIds: [] },
    { id: 4, isStart: false, continueToBlockId: 5, optionTargetBlockIds: [], outcomeTargetBlockIds: [] },
    { id: 5, isStart: false, continueToBlockId: null, optionTargetBlockIds: [], outcomeTargetBlockIds: [] },
    { id: 6, isStart: false, continueToBlockId: null, optionTargetBlockIds: [], outcomeTargetBlockIds: [] }
  ])],
  [1, 2, 3, 4, 5]
);

const branchBlocks = [
  { branchId: null, key: "first-choice", kind: "CHOICE", position: 1, visibilityRule: null, options: [{ action: "REVEAL", revealBranchId: 10 }] },
  { branchId: null, key: "base-tail", kind: "MARKDOWN", position: 2, visibilityRule: null, options: [] },
  { branchId: 10, key: "branch-text", kind: "MARKDOWN", position: 1, visibilityRule: null, options: [] },
  { branchId: 10, key: "nested-choice", kind: "CHOICE", position: 2, visibilityRule: null, options: [{ action: "REVEAL", revealBranchId: 20 }] },
  { branchId: 20, key: "nested-text", kind: "MARKDOWN", position: 1, visibilityRule: null, options: [] }
];
assert.deepEqual(visibleExplorationBlocks(branchBlocks, {}).map((block) => block.key), ["first-choice", "base-tail"]);
assert.deepEqual(
  visibleExplorationBlocks(branchBlocks, {
    [explorationBranchStateKey(10)]: true,
    [explorationBranchStateKey(20)]: true
  }).map((block) => block.key),
  ["first-choice", "branch-text", "nested-choice", "nested-text", "base-tail"]
);
assert.deepEqual([...descendantExplorationBranchIds(branchBlocks, [10])], [10, 20]);
assert.deepEqual(
  clearExplorationBranches({
    [explorationBranchStateKey(10)]: true,
    [explorationBranchStateKey(20)]: true,
    "block.page:nested-choice.answered": true
  }, branchBlocks, [10], "page"),
  {
    branchIds: [10, 20],
    clearedBlockKeys: ["page:branch-text", "page:nested-choice", "page:nested-text"],
    state: {}
  }
);

const explorationChangeNow = new Date("2026-07-18T12:00:00.000Z").getTime();
const recentExplorationChange = {
  changeSummary: "Updated block 2 on Introduction",
  publishedAt: new Date(explorationChangeNow - EXPLORATION_CHANGE_COALESCE_MS + 1),
  publishedById: 7,
  sessionCount: 0
};
assert.equal(shouldCoalesceExplorationChange(recentExplorationChange, 7, recentExplorationChange.changeSummary, explorationChangeNow), true);
assert.equal(shouldCoalesceExplorationChange({ ...recentExplorationChange, publishedById: 8 }, 7, recentExplorationChange.changeSummary, explorationChangeNow), false);
assert.equal(shouldCoalesceExplorationChange({ ...recentExplorationChange, sessionCount: 1 }, 7, recentExplorationChange.changeSummary, explorationChangeNow), false);
assert.equal(
  shouldCoalesceExplorationChange(
    { ...recentExplorationChange, publishedAt: new Date(explorationChangeNow - EXPLORATION_CHANGE_COALESCE_MS) },
    7,
    recentExplorationChange.changeSummary,
    explorationChangeNow
  ),
  true
);
assert.equal(
  shouldCoalesceExplorationChange(
    { ...recentExplorationChange, publishedAt: new Date(explorationChangeNow - EXPLORATION_CHANGE_COALESCE_MS - 1) },
    7,
    recentExplorationChange.changeSummary,
    explorationChangeNow
  ),
  false
);

const rankedGroupMatches = rankSearchMatches(
  [
    { title: "Abelian group", slug: "abelian-group", aliases: [] },
    { title: "Category of groups", slug: "category-of-groups", aliases: [] },
    { title: "Group", slug: "group", aliases: [] },
    { title: "Group action", slug: "group-action", aliases: [] }
  ],
  "group"
);
assert.deepEqual(rankedGroupMatches.map((item) => item.title), ["Group", "Group action", "Abelian group", "Category of groups"]);
assert.equal(searchMatchScore({ title: "Groupe", slug: "groupe", aliases: ["Group"] }, "group"), 1);
assert.deepEqual(searchMorphologyVariants("Rings", "en"), ["rings", "ring"]);
assert.deepEqual(searchMorphologyVariants("Finite rings", "en"), ["finite rings", "finite ring"]);
assert.deepEqual(searchMorphologyVariants("Rung", "en"), ["rung"]);
assert.deepEqual(searchMorphologyVariants("Lens", "en"), ["lens"]);
assert.deepEqual(searchMorphologyVariants("Anneaux commutatifs", "fr"), ["anneaux commutatifs", "anneau commutatif"]);
const ringMorphologyVariants = searchMorphologyVariants("Rings", "en");
const rankedRingMatches = rankSearchMatches(
  [
    { title: "Category of rings", slug: "category-of-rings", aliases: [] },
    { title: "Ring", slug: "ring", aliases: [] }
  ],
  "Rings",
  undefined,
  ringMorphologyVariants
);
assert.deepEqual(rankedRingMatches.map((item) => item.title), ["Ring", "Category of rings"]);
assert.equal(
  searchMatchScore({ title: "Ring", slug: "ring" }, "Rung", searchMorphologyVariants("Rung", "en")),
  10
);

const mathematicianFixtures = [
  {
    userId: 1,
    username: "ada",
    displayName: "Ada",
    avatarBackground: null,
    avatarUrl: null,
    role: Role.USER,
    mathLevel: UserMathLevel.RESEARCH,
    bio: "Geometry and teaching",
    affiliation: "Example University",
    websiteUrl: null,
    mathematicalDomains: [MathDomain.GEOMETRY],
    openToCollaboration: true,
    joinedAt: new Date("2026-01-01"),
    reputation: 10,
    problemCount: 2,
    solvedCount: 3,
    favoriteCount: 1,
    engagementCount: 4,
    conceptCount: 2,
    explorationCount: 1,
    dailyProblemCount: 0
  },
  {
    userId: 2,
    username: "emmy",
    displayName: "Emmy",
    avatarBackground: null,
    avatarUrl: null,
    role: Role.MODERATOR,
    mathLevel: UserMathLevel.GRADUATE_CONTEST,
    bio: "Algebra",
    affiliation: null,
    websiteUrl: null,
    mathematicalDomains: [MathDomain.ALGEBRA],
    openToCollaboration: false,
    joinedAt: new Date("2026-02-01"),
    reputation: 20,
    problemCount: 1,
    solvedCount: 0,
    favoriteCount: 0,
    engagementCount: 0,
    conceptCount: 0,
    explorationCount: 0,
    dailyProblemCount: 1
  }
] satisfies UserReputationSummary[];

assert.equal(DAILY_PROBLEM_REPUTATION_POINTS, 50);
assert.equal(dailyProblemReputationBonus(3), 150);
assert.equal(dailyProblemReputationBonus(-2), 0);

assert.equal(defaultAvatarPresetForUsername("ada"), defaultAvatarPresetForUsername("Ada"));
assert.ok(DEFAULT_AVATAR_PRESETS.includes(defaultAvatarPresetForUsername("emmy")));
assert.equal(parseDefaultAvatarPreset("owl"), "owl");
assert.equal(parseDefaultAvatarPreset("dragon"), null);
assert.equal(defaultAvatarPath("owl"), "/avatars/default/owl.svg");
assert.equal(avatarPresetFromUrl("/avatars/default/owl.svg"), "owl");
assert.equal(avatarPresetFromUrl("/avatars/default/dragon.svg"), null);
assert.equal(avatarPresetFromUrl("https://example.com/avatars/default/owl.svg"), null);
assert.equal(parseAvatarBackground("moss"), "moss");
assert.equal(parseAvatarBackground("#ff0000"), null);
assert.equal(avatarBackgroundOption("ada", "rose").id, "rose");
assert.ok(AVATAR_BACKGROUND_OPTIONS.some((option) => option.id === avatarBackgroundOption("ada").id));

assert.deepEqual(filterMathematicians(mathematicianFixtures, { query: "university" }).map((user) => user.username), ["ada"]);
assert.deepEqual(filterMathematicians(mathematicianFixtures, { domain: MathDomain.ALGEBRA }).map((user) => user.username), ["emmy"]);
assert.deepEqual(filterMathematicians(mathematicianFixtures, { collaborationOnly: true }).map((user) => user.username), ["ada"]);
assert.equal(mathematicianContributionCount(mathematicianFixtures[0]), 5);
assert.deepEqual(sortMathematicians(mathematicianFixtures, "reputation").map((user) => user.username), ["emmy", "ada"]);
assert.deepEqual(sortMathematicians(mathematicianFixtures, "contributions").map((user) => user.username), ["ada", "emmy"]);

const problemDomainValues = PROBLEM_DOMAINS.flatMap((domain) => [
  domain.value,
  ...(domain.children ?? []).map((child) => child.value)
]);
const englishDomainLabels = en.home.domainLabels as Record<string, string>;
const frenchDomainLabels = fr.home?.domainLabels as Record<string, string>;
for (const domainValue of problemDomainValues) {
  assert.equal(typeof englishDomainLabels[domainValue], "string", `Missing English domain label for ${domainValue}`);
  assert.equal(typeof frenchDomainLabels[domainValue], "string", `Missing French domain label for ${domainValue}`);
}
const frenchProblemDomains = translatedDomainOptions(PROBLEM_DOMAINS, frenchDomainLabels);
assert.equal(frenchProblemDomains.find((domain) => domain.value === "linear-algebra")?.label, "Algèbre linéaire");
assert.equal(
  frenchProblemDomains
    .find((domain) => domain.value === "linear-algebra")
    ?.children?.find((domain) => domain.value === "linear-algebra-lie-algebras")?.label,
  "Algèbres de Lie"
);

assert.equal(normalizeProblemChallengeMessage("  Try this one!  "), "Try this one!");
assert.equal(
  normalizeProblemChallengeMessage("x".repeat(PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH + 20)).length,
  PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH
);
assert.equal(
  problemChallengeNotificationBody({
    challengerName: "Emmy",
    problemTitle: "A short proof",
    message: "I think you will like it."
  }),
  'Emmy challenged you to solve "A short proof". I think you will like it.'
);
assert.equal(
  problemChallengeNotificationBody({
    challengerName: "Emmy",
    problemTitle: "A short proof"
  }),
  'Emmy challenged you to solve "A short proof".'
);
assert.equal(
  problemShareNotificationBody({
    senderName: "Emmy",
    problemTitle: "A short proof",
    message: "This made me think of you."
  }),
  'Emmy shared the problem "A short proof" with you. This made me think of you.'
);
assert.equal(
  problemShareNotificationBody({
    senderName: "Emmy",
    problemTitle: "A short proof"
  }),
  'Emmy shared the problem "A short proof" with you.'
);
assert.equal(
  problemDeliveryChatMarkdown({
    intent: "challenge",
    problemTitle: "A short proof",
    problemSlug: "a-short-proof",
    message: "I think you will like it."
  }),
  "**Challenge**\n\n[A short proof](/problems/a-short-proof)\n\nI think you will like it."
);
assert.equal(
  problemDeliveryChatMarkdown({
    intent: "share",
    problemTitle: "Sequences [and series]",
    problemSlug: "sequences-and-series"
  }),
  "**Shared problem**\n\n[Sequences \\[and series\\]](/problems/sequences-and-series)"
);
const challengeInviteToken = "a".repeat(43);
assert.equal(normalizeProblemChallengeInviteToken(challengeInviteToken), challengeInviteToken);
assert.equal(normalizeProblemChallengeInviteToken("../not-a-token"), null);
assert.equal(problemChallengeInviteTokenHash(challengeInviteToken).length, 64);
assert.equal(problemChallengeInvitePath(challengeInviteToken), `/challenge/${challengeInviteToken}`);

assert.equal(parseMinimumConceptExercises(undefined), 0);
assert.equal(parseMinimumConceptExercises("3"), 3);
assert.equal(parseMinimumConceptExercises("2.5"), 0);
assert.equal(parseMinimumConceptExercises("999"), MAX_CONCEPT_EXERCISES);
assert.equal(parseConceptExerciseCount(undefined), null);
assert.equal(parseConceptExerciseCount(""), null);
assert.equal(parseConceptExerciseCount("0"), 0);
assert.equal(parseConceptExerciseCount("4"), 4);
assert.equal(parseConceptExerciseCount("2.5"), null);
assert.equal(parseConceptExerciseCount("999"), MAX_CONCEPT_EXERCISES);
assert.equal(parseConceptExerciseCountMode("at-most"), "at-most");
assert.equal(parseConceptExerciseCountMode("unexpected"), "at-least");
assert.equal(parseConceptKind("THEOREM"), ConceptKind.THEOREM);
assert.equal(parseConceptKind("INTUITIVE_NOTION"), ConceptKind.INTUITIVE_NOTION);
assert.equal(parseConceptKind("unexpected"), ConceptKind.DEFINITION);
assert.equal(parseConceptKind(undefined, ConceptKind.THEOREM), ConceptKind.THEOREM);

const multilingualHints = [
  {
    id: 1,
    translationGroupId: "first",
    problemId: 10,
    proofId: null,
    position: 0,
    bodyMarkdown: "First hint",
    bodyHtml: "<p>First hint</p>",
    language: "en",
    translatedFromProblemId: null
  },
  {
    id: 2,
    translationGroupId: "second",
    problemId: 10,
    proofId: null,
    position: 1,
    bodyMarkdown: "Second hint",
    bodyHtml: "<p>Second hint</p>",
    language: "en",
    translatedFromProblemId: null
  },
  {
    id: 3,
    translationGroupId: "first",
    problemId: 20,
    proofId: null,
    position: 0,
    bodyMarkdown: "Premier indice",
    bodyHtml: "<p>Premier indice</p>",
    language: "fr",
    translatedFromProblemId: 10
  }
];
const selectedFrenchHints = selectProblemHintsForLanguage(multilingualHints, 20);
assert.deepEqual(selectedFrenchHints.map((hint) => hint.id), [3, 2]);
assert.deepEqual(selectedFrenchHints.map((hint) => hint.isLanguageFallback), [false, true]);
assert.deepEqual(
  selectProblemHintsForLanguage(multilingualHints, 10).map((hint) => hint.id),
  [1, 2]
);

const recommendationNow = new Date("2026-08-01T12:00:00.000Z");
const recommendationProfile = buildRecommendationProfile(
  {
    mathLevel: "UNDERGRAD",
    mathematicalDomains: ["ALGEBRA"],
    attempts: [
      {
        translationGroupId: "solved-algebra",
        difficulty: 40,
        domains: ["ALGEBRA"],
        status: "SOLVED",
        updatedAt: recommendationNow
      },
      {
        translationGroupId: "blocked-topology",
        difficulty: 80,
        domains: ["TOPOLOGY"],
        status: "BLOCKED",
        updatedAt: recommendationNow
      }
    ],
    favorites: []
  },
  recommendationNow
);
assert.equal(recommendationProfile.declaredDifficulty, 30);
assert.ok(recommendationProfile.targetDifficulty > 30 && recommendationProfile.targetDifficulty < 50);
assert.ok(recommendationProfile.difficultyConfidence > 0.3);
assert.ok(recommendationProfile.domains.ALGEBRA.affinity > recommendationProfile.domains.TOPOLOGY.affinity);

const reactionAdjustedProfile = buildRecommendationProfile(
  {
    mathLevel: "UNDERGRAD",
    mathematicalDomains: ["ALGEBRA"],
    attempts: [],
    favorites: [],
    reactions: [
      {
        difficulty: 30,
        domains: ["ALGEBRA"],
        difficultyReaction: "TOO_EASY",
        preferenceReaction: "MORE_LIKE_THIS",
        updatedAt: recommendationNow
      }
    ]
  },
  recommendationNow
);
assert.ok(reactionAdjustedProfile.targetDifficulty > 30);
assert.ok(reactionAdjustedProfile.domains.ALGEBRA.affinity > 0.35);

const fittingRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 1,
    translationGroupId: "candidate",
    difficulty: 42,
    domains: ["ALGEBRA"],
    qualityStatus: "REVIEWED",
    isExercise: false,
    createdAt: recommendationNow
  },
  { mathLevel: "UNDERGRAD", now: recommendationNow }
);
const poorRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 2,
    translationGroupId: "poor-candidate",
    difficulty: 95,
    domains: ["GEOMETRY"],
    qualityStatus: "NEEDS_WORK",
    isExercise: false,
    createdAt: new Date("2025-01-01T00:00:00.000Z")
  },
  { mathLevel: "UNDERGRAD", now: recommendationNow }
);
assert.ok(fittingRecommendation && poorRecommendation);
assert.ok(fittingRecommendation.score > poorRecommendation.score);
assert.equal(
  fittingRecommendation.score,
  fittingRecommendation.parts.reduce((total, part) => total + part.points, 0)
);
assert.equal(
  scoreProblemRecommendation(
    recommendationProfile,
    {
      id: 3,
      translationGroupId: "already-solved",
      difficulty: 35,
      domains: ["ALGEBRA"],
      qualityStatus: "REVIEWED",
      isExercise: false,
      createdAt: recommendationNow,
      attemptStatus: "SOLVED"
    },
    { mathLevel: "UNDERGRAD", now: recommendationNow }
  ),
  null
);
const recentlyBlockedRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 4,
    translationGroupId: "recently-blocked",
    difficulty: 45,
    domains: ["ALGEBRA"],
    qualityStatus: "REVIEWED",
    isExercise: false,
    createdAt: recommendationNow,
    attemptStatus: "BLOCKED",
    attemptUpdatedAt: recommendationNow
  },
  { mathLevel: "UNDERGRAD", now: recommendationNow }
);
assert.equal(
  recentlyBlockedRecommendation?.parts.find((part) => part.code === "recently_blocked")?.points,
  -9
);

const progressMap = buildProgressMap(
  [
    { translationGroupId: "algebra-1", domain: "algebra" },
    { translationGroupId: "algebra-2", domain: "algebra" },
    { translationGroupId: "topology-1", domain: "topology" }
  ],
  new Set(["algebra-2", "topology-1"]),
  (problem) => problem.domain
);
assert.deepEqual(progressMap.get("algebra"), { done: 1, total: 2 });
assert.deepEqual(progressMap.get("topology"), { done: 1, total: 1 });

assert.equal(dailyProblemDateKey(new Date("2026-08-01T21:30:00.000Z")), "2026-08-01");
assert.equal(dailyProblemDateKey(new Date("2026-08-01T22:30:00.000Z")), "2026-08-02");
assert.equal(addDaysToDateKey("2028-02-28", 1), "2028-02-29");
assert.equal(addDaysToDateKey("2026-12-31", 1), "2027-01-01");
assert.equal(isDailyProblemDateKey("2026-02-29"), false);
assert.deepEqual(
  upcomingDailyProblemDateKeys(new Date("2026-08-01T12:00:00.000Z"), 3),
  ["2026-08-01", "2026-08-02", "2026-08-03"]
);
assert.equal(dailyProblemRotationIndex(5, "2026-08-01"), dailyProblemRotationIndex(5, "2026-08-06"));
assert.equal(
  automaticDailyProblemGroup([
    { createdAt: new Date("2026-07-30T12:00:00.000Z"), qualityStatus: "REVIEWED", translationGroupId: "old" },
    { createdAt: new Date("2026-08-01T09:00:00.000Z"), qualityStatus: "UNREVIEWED", translationGroupId: "recent-unreviewed" },
    { createdAt: new Date("2026-08-01T10:00:00.000Z"), qualityStatus: "REVIEWED", translationGroupId: "recent-reviewed" }
  ], "2026-08-03"),
  "recent-reviewed"
);
assert.equal(
  automaticDailyProblemGroup([
    { createdAt: new Date("2026-08-01T09:00:00.000Z"), qualityStatus: "UNREVIEWED", translationGroupId: "recent" },
    { createdAt: new Date("2026-07-31T10:00:00.000Z"), qualityStatus: "REVIEWED", translationGroupId: "old-reviewed" }
  ], "2026-08-03"),
  "recent"
);
assert.equal(automaticDailyProblemGroup([], "2026-08-03"), null);
assert.ok(DEFAULT_DAILY_PROBLEM_IMAGE_URLS.includes(dailyProblemDefaultImageUrl("2026-08-03")));

assert.equal(pickRandomDifferent([], undefined, () => 0), undefined);
assert.equal(pickRandomDifferent(["only"], "only", () => 0), "only");
assert.equal(pickRandomDifferent(["first", "second", "third"], "first", () => 0), "second");
assert.equal(pickRandomDifferent(["first", "second", "third"], "second", () => 0.99), "third");

assert.equal(
  needsReviewAfterProblemEdit({
    alreadyNeedsReview: false,
    currentStatus: QualityStatus.REVIEWED,
    hasReviewSensitiveChanges: true
  }),
  true
);
assert.equal(
  needsReviewAfterProblemEdit({
    alreadyNeedsReview: false,
    currentStatus: QualityStatus.REVIEWED,
    hasReviewSensitiveChanges: false
  }),
  false
);
assert.equal(
  needsReviewAfterProblemEdit({
    alreadyNeedsReview: true,
    currentStatus: QualityStatus.UNREVIEWED,
    hasReviewSensitiveChanges: false
  }),
  true
);

assert.equal(hasProblemReviewSensitiveChanges(["title"]), true);
assert.equal(hasProblemReviewSensitiveChanges(["bodyMarkdown"]), true);
assert.equal(hasProblemReviewSensitiveChanges(["difficulty"]), false);
assert.equal(
  hasProblemReviewSensitiveChanges([
    "domains",
    "tags",
    "listed",
    "isExercise",
    "showRelatedProblems",
    "canAppearOnFrontPage",
    "origin",
    "verificationMode"
  ]),
  false
);

console.log("core tests ok");
