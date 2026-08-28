import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConceptKind, ConceptStatus, MathDomain, NotificationType, Prisma, QualityStatus, ReportCategory, Role, UserMathLevel } from "@prisma/client";
import { EditorState, StateEffect } from "@codemirror/state";
import sharp from "sharp";
import { discussionIsUnlocked, formatUnlockDistance, unlockDate } from "../lib/attempts.ts";
import { creationSubmissionKey } from "../lib/creation-submission.ts";
import { loginHrefForReturnTo, requestReturnToPath } from "../lib/auth-return.ts";
import {
  getBooleanAttribute,
  getNumberAttribute,
  getStringArrayAttribute,
  getStringAttribute,
  parseMarkdownDocument
} from "../lib/frontmatter.ts";
import { latexDeleteChange } from "../lib/latex-deletion.ts";
import { MATH_WOODS_KATEX_MACROS } from "../lib/latex-macros.ts";
import { markdownDraftConflictsWithSource } from "../lib/markdown-drafts.ts";
import { markdownImageSizingFromSrc, markdownImageSrcWithWidth } from "../lib/markdown-images.ts";
import { assertRateLimitOnce, RateLimitError } from "../lib/rate-limit.ts";
import { mathWoodsTourCopy, parseMathWoodsTourStep } from "../lib/math-woods-tour.ts";
import { parseObservabilityRange } from "../lib/observability-dashboard.ts";
import { normalizedObservabilityRoute } from "../lib/observability-routes.ts";
import { localizeNotification } from "../lib/notification-copy.ts";
import {
  MAX_CONCEPT_EXERCISES,
  parseConceptExerciseCount,
  parseConceptExerciseCountMode,
  parseConceptExerciseIds,
  parseMinimumConceptExercises
} from "../lib/concept-exercises.ts";
import { conceptCreationNotificationCopy } from "../lib/concept-creation-notifications.ts";
import { orderedUniqueIds, overlappingConceptLanguages } from "../lib/concept-merge.ts";
import { parseConceptKind } from "../lib/concept-kinds.ts";
import {
  hasExamplesSection,
  parseContributionTaskKey,
  parseProblemTranslationTaskKey,
  problemTranslationTaskTargetLanguage,
  translationGroupCount,
  translationSourcesMissingLanguage
} from "../lib/contribution-tasks.ts";
import { localizeContributionPage } from "../lib/contribution-page-copy.ts";
import { slugify } from "../lib/slug.ts";
import { isSitePresenceId, sitePresenceIsActive } from "../lib/site-presence-config.ts";
import {
  normalizeUsernameLookup,
  profilePath,
  publicProfileLookupWhere,
  usernameLookupFilter
} from "../lib/usernames.ts";
import { parseUserDiscoverySource } from "../lib/user-discovery-source.ts";
import { PROBLEM_DIFFICULTY_HELP, problemDifficultyBars, problemDifficultyTone } from "../lib/problem-difficulty.ts";
import {
  HOME_GUEST_PROBLEM_GROUP_IDS,
  sortHomeGuestProblemsByDifficulty
} from "../lib/home-guest-problems.ts";
import { DEFAULT_HOME_PRIORITIES, homePriorityForLocale } from "../lib/home-priorities.ts";
import { formatProblemSolvedDate, problemSolvedAt } from "../lib/problem-solved-date.ts";
import { shouldShowOwnerSolvedBanner } from "../lib/problem-owner-solved-banner.ts";
import {
  isProblemRecommendationEligible,
  RECOMMENDATION_DIFFICULTY_CEILING
} from "../lib/problem-recommendation-eligibility.ts";
import { parseGuestContentViews, recordGuestContentView } from "../lib/guest-content-access.ts";
import { problemCreationNotificationCopy } from "../lib/problem-creation-notifications.ts";
import { selectProblemBrowserTranslation } from "../lib/problem-browser-translations.ts";
import {
  isUnknownProblemOrigin,
  localizedProblemOrigin,
  normalizeProblemOrigin
} from "../lib/problem-origin.ts";
import {
  conceptTranslationSharedChanges,
  problemTranslationSharedChanges
} from "../lib/translation-properties.ts";
import {
  latestTranslationTextRevisionId,
  revisionSnapshotTitle
} from "../lib/translation-text-revisions.ts";
import {
  TRANSLATION_LINK_OVERRIDE_FIELD,
  translationLinkOverrideRequested
} from "../lib/translation-link-warning.ts";
import {
  assertTranslationTitleChanged,
  normalizeTranslationTitle,
  SAME_TRANSLATION_TITLE_OVERRIDE_FIELD,
  sameTranslationTitleOverrideRequested,
  SameTranslationTitleError,
  translationTitlesMatch
} from "../lib/translation-title-guard.ts";
import {
  parseSelectedTranslationIds,
  TRANSLATED_PROOF_BODY_PREFIX,
  translationBodyFieldName
} from "../lib/translation-companions.ts";
import {
  hasProblemReviewSensitiveChanges,
  needsReviewAfterProblemEdit
} from "../lib/problem-review-state.ts";
import {
  buildRecommendationProfile,
  composeProblemRecommendations,
  excludedRecommendationGroupIds,
  recommendationDifficultyAdjustment,
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
import { combineSearchFilters, searchFilterHref } from "../lib/search-filters.ts";
import { canViewProblem, visibleProblemWhere } from "../lib/problem-visibility.ts";
import { canViewProblemSolutions } from "../lib/problem-solution-visibility.ts";
import {
  extractWikiLinks,
  makeWikiLinkLabelsExplicit,
  replaceWikiLinkLabels,
  missingConceptHref,
  problemLinkMarkup,
  replaceWikiLinks,
  wikiLinkMarkup
} from "../lib/wikilinks.ts";
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
import { processContentImage } from "../lib/content-images.ts";
import {
  imageUploadNetworkError,
  imageUploadResponseError,
  objectStorageUploadError
} from "../lib/image-upload-errors.ts";
import { chatImageDailyLimitForRole, chatImageUrl } from "../lib/chat-image-config.ts";
import {
  CLIENT_BUNDLE_RELOAD_COOLDOWN_MS,
  chunkLoadErrorSignature,
  clientBundleErrorSignature,
  isChunkLoadError,
  isClientBundleError,
  shouldReloadForClientBundleError
} from "../lib/chunk-load-error.ts";
import { chatDayKey } from "../lib/chat-dates.ts";
import { chatDistanceFromBottom, chatIsNearBottom, chatScrollTopAfterPrepend } from "../lib/chat-scroll.ts";
import { friendsForMenu, parseFriendsMenuPreferences } from "../lib/friends-menu-preferences.ts";
import { shouldSendChatOnEnter } from "../lib/chat-compose.ts";
import { normalizeChatReplyToId } from "../lib/chat-replies.ts";
import { applyChatMessageDeletions, applyChatMessageUpdates } from "../lib/chat-message-updates.ts";
import {
  applyChatReactionUpdates,
  isChatReaction,
  summarizeChatReactions
} from "../lib/chat-reactions.ts";
import { chatUnreadDocumentTitle, shouldAcknowledgeChat } from "../lib/chat-unread.ts";
import {
  miniChatDraftStorageKey,
  readMiniChatDraft,
  writeMiniChatDraft
} from "../lib/chat-drafts.ts";
import { formatCompactNumber } from "../lib/compact-number.ts";
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
import { selectDailyTipForDate } from "../lib/daily-tip-schedule.ts";
import {
  contestCreationWindow,
  contestEndDateKey,
  contestIsOpen,
  contestPhase,
  isSaturdayDateKey,
  nextContestStartDateKey
} from "../lib/problem-contests.ts";
import {
  parseSolutionReportCategory,
  solutionConcernIsPublic,
  solutionReportCategoryLabel
} from "../lib/solution-reports.ts";
import {
  DAILY_CONCEPT_REVIEW_STALE_POOL_SIZE,
  dailyConceptReviewStatusRank,
  isDailyConceptReviewStatus,
  pickStaleConceptCandidate
} from "../lib/daily-concept-review-selection.ts";
import { dailyReminderWindow } from "../lib/daily-reminder-window.ts";
import {
  DEFAULT_TIP_IMAGE_POSITION,
  DEFAULT_TIP_IMAGE_URL,
  dailyTipImage,
  normalizeTipImagePosition,
  normalizeTipImageUrl,
  tipImageDateKey,
  tipImageObjectPosition,
  tipImageUrl
} from "../lib/tip-images.ts";
import { selectTipProblemTranslations } from "../lib/tip-problem-translations.ts";
import { selectTipTranslation } from "../lib/tip-translations.ts";
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
  ACHIEVEMENTS,
  achievementsForLocale,
  localizeAchievementNotification
} from "../lib/achievement-copy.ts";
import {
  normalizeProblemChallengeMessage,
  problemDeliveryChatMarkdown,
  problemChallengeNotificationBody,
  problemShareNotificationBody,
  PROBLEM_CHALLENGE_MESSAGE_MAX_LENGTH
} from "../lib/problem-challenges.ts";
import {
  CONCEPT_SHARE_MESSAGE_MAX_LENGTH,
  conceptShareChatMarkdown,
  conceptShareNotificationBody,
  normalizeConceptShareMessage
} from "../lib/concept-shares.ts";
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
  multilineSelectionOverlapsLatexLines,
  rangeOverlapsLinesBetween,
  selectionSpansLineBreakInsideLatexRange,
  suppressLatexPreviewAfterLineJoin,
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
import { parseOAuthProvider, safeReturnTo, selectVerifiedGithubEmail } from "../lib/oauth-utils.ts";
import {
  filterMathematicians,
  mathematicianContributionCount,
  sortMathematicians
} from "../lib/mathematicians.ts";
import type { UserReputationSummary } from "../lib/user-reputation.ts";
import {
  AUTHORED_CONCEPT_REPUTATION_POINTS,
  AUTHORED_PROBLEM_BASE_REPUTATION_POINTS,
  authoredConceptReputationBonus,
  contentHasIllustration,
  curationActivityReputationBonus,
  DAILY_PROBLEM_REPUTATION_POINTS,
  dailyProblemReputationBonus,
  learningSolveReputationBonus,
  PROBLEM_TRANSLATION_REPUTATION_POINTS,
  problemAuthorshipReputationBonus,
  reviewedContributionReputationBonus,
  solutionAuthorshipReputationBonus,
  translationReputationBonus
} from "../lib/reputation-scoring.ts";
import {
  isTrustedUserCandidate,
  TRUSTED_USER_REPUTATION_THRESHOLD
} from "../lib/trusted-user-policy.ts";
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
import { jsxGraphFoldRangeAtLine } from "../lib/jsxgraph-folding.ts";
import {
  assignableRolesFor,
  canAssignRole,
  canChangeConceptStatus,
  canDeletePlaylist,
  canEditProblem,
  canEditSolution,
  canProposeProblemEdit,
  canPublishProblemEdit,
  canPublishProblemEditForTarget,
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
import { parseProblemDifficulty } from "../lib/problems.ts";
import { parseProblemStyle, parseProblemStyles, problemStylesFromLegacyTagSlugs } from "../lib/problem-styles.ts";
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
  markdownMarkupShouldRemainVisible,
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
  normalizeKnownProblemSourceName,
  parseKnownProblemSourceIconSize,
  parseKnownProblemSourceAliases,
  problemOriginMatchesKnownSource,
  problemSourcePresentation
} from "../lib/known-problem-sources.ts";
import {
  mergeProblemRevisionSnapshots,
  parseProblemRevisionSnapshot,
  type ProblemRevisionSnapshot
} from "../lib/problem-revisions.ts";
import {
  changedConceptSnapshotFields,
  conceptRevisionAutomaticSummary,
  parseConceptRevisionSnapshot,
  type ConceptRevisionSnapshot
} from "../lib/concept-revisions.ts";
import { buildRevisionDiff } from "../lib/revision-diff.ts";
import { parseContributorQualityStatus, qualityLabel } from "../lib/quality.ts";
import { sanitizeReportPath } from "../lib/security.ts";
import { clientAddressFromHeaders, secretsMatch } from "../lib/request-security.ts";
import {
  rankSearchMatches,
  searchDatabaseVariants,
  searchMatchScore,
  searchMorphologyVariants
} from "../lib/search-ranking.ts";
import { parseTagInput } from "../lib/tags.ts";
import {
  hrefWithTranslationViewLanguage,
  nextMissingTranslationLanguage,
  preferredTranslationForLanguage,
  selectContentTranslation,
  selectContentTranslationsByGroup,
  selectExactContentTranslation,
  selectExactContentTranslationsByGroup,
  translationLanguageSet
} from "../lib/translation-routing.ts";
import { dictionaryForContentLanguage, interfaceLocaleForContentLanguage } from "../lib/i18n/dictionary.ts";
import { contentLanguageFallback } from "../lib/content-language-fallback.ts";
import {
  ACTIVE_CONTENT_LANGUAGES,
  contentLanguageLabel,
  contentLanguageNativeLabel,
  FUTURE_CONTENT_LANGUAGES,
  editableContentLanguage,
  isActiveContentLanguage,
  parseActiveContentLanguage,
  parseContentLanguage,
  requireActiveContentLanguage
} from "../lib/languages.ts";
import {
  applyEffects,
  conditionMatches,
  numericAnswerMatches,
  parseExplorationValue
} from "../lib/exploration-engine.ts";

assert.equal(slugify("Relations de Viète"), "relations-de-viete");
assert.equal(slugify("  L'espace vectoriel ! "), "lespace-vectoriel");
assert.equal(normalizeUsernameLookup(" Paulownia "), "paulownia");
assert.equal(normalizeUsernameLookup("ＰＡＵＬＯＷＮＩＡ"), "paulownia");
assert.deepEqual(usernameLookupFilter("Paulownia"), { equals: "paulownia", mode: "insensitive" });
assert.equal(profilePath({ profileSlug: "anduril" }), "/profile/anduril");
assert.equal(profilePath({ profileSlug: "anduril" }, "?view=solved"), "/profile/anduril?view=solved");
assert.deepEqual(publicProfileLookupWhere(" Anduril "), {
  OR: [
    { profileSlug: { equals: "anduril", mode: "insensitive" } },
    { username: { equals: "anduril", mode: "insensitive" } }
  ]
});
const frenchAchievements = achievementsForLocale("fr");
assert.equal(ACHIEVEMENTS.length, 9);
assert.equal(frenchAchievements.length, ACHIEVEMENTS.length);
assert.deepEqual(
  frenchAchievements.map(({ key, title, description }) => ({ key, title, description })),
  [
    { key: "a-place-in-the-woods", title: "Une place dans les bois", description: "Complétez votre description de profil." },
    { key: "first-clearing", title: "Première clairière", description: "Résolvez votre premier problème." },
    { key: "pathfinder", title: "Éclaireur", description: "Résolvez 10 problèmes." },
    { key: "ascending-the-mountain", title: "Gravir la montagne", description: "Résolvez 100 problèmes." },
    { key: "lantern-bearer", title: "Porte-lanterne", description: "Ajoutez votre premier indice à un problème." },
    {
      key: "the-helpful-stranger",
      title: "Main secourable",
      description: "Recevez 10 votes utiles sur vos indices ou messages de discussion."
    },
    { key: "proofsmith", title: "Forgeron de solutions", description: "Publiez votre première solution." },
    { key: "cartographer", title: "Cartographe", description: "Créez 10 pages de concept." },
    {
      key: "trail-maker",
      title: "Ouvreur de sentiers",
      description: "Faites résoudre par d’autres utilisateurs 5 problèmes auxquels vous avez contribué."
    }
  ]
);
assert.deepEqual(
  localizeAchievementNotification(
    {
      type: "ACHIEVEMENT_UNLOCKED",
      title: "Achievement unlocked",
      body: "First Clearing: Solve your first problem."
    },
    "fr"
  ),
  { title: "Succès débloqué", body: "Première clairière : Résolvez votre premier problème." }
);
assert.equal(problemDifficultyTone(null), "#8a9184");
assert.equal(problemDifficultyTone(1), "#4f7955");
assert.equal(problemDifficultyTone(20), "#617a42");
assert.equal(problemDifficultyTone(40), "#857a35");
assert.equal(problemDifficultyTone(100), "#87342d");
assert.notEqual(problemDifficultyTone(19), problemDifficultyTone(20));
assert.notEqual(problemDifficultyTone(20), problemDifficultyTone(21));
assert.notEqual(problemDifficultyTone(39), problemDifficultyTone(40));

const contributionSectionFixtures = [
  {
    position: 1,
    title: "Make rough work visible",
    bodyMarkdown:
      "Mark unfinished material honestly. Use **Needs work**, stub statuses, talk pages, edit summaries, and reports. A rough page with clear uncertainty is useful."
  },
  {
    position: 6,
    title: "Use reports without making them scary",
    bodyMarkdown:
      "Reports are not only for emergencies. They can flag copied wording, questionable origins, wrong statements, spoilers, or pages that need attention."
  }
];
const localizedFrenchRequestsPage = localizeContributionPage({
  content: {
    title: "Contribution",
    requestEyebrow: "Requests",
    requestTitle: "Requested problems and concepts",
    requestIntro:
      "Ask for the pages you would like to see from the problem and concept browsers. Trusted contributors can claim a request, work on it, release it if they stop, and mark it complete when the page or problem exists."
  },
  sections: [
    {
      position: 0,
      title: "Do not wait for perfection.",
      bodyMarkdown:
        "A clean problem, a stub concept, a source note, a partial solution, or a correction request can already help."
    },
    ...contributionSectionFixtures
  ]
}, "fr");
assert.equal(localizedFrenchRequestsPage.content.title, "Requêtes");
assert.equal(localizedFrenchRequestsPage.content.requestTitle, "Demandes de problèmes et de concepts");
assert.equal(localizedFrenchRequestsPage.sections.length, contributionSectionFixtures.length);
assert.ok(localizedFrenchRequestsPage.sections.every((section) => !section.title.includes("perfection")));
assert.ok(localizedFrenchRequestsPage.sections.every((section, index) =>
  section.title !== contributionSectionFixtures[index]?.title &&
  section.bodyMarkdown !== contributionSectionFixtures[index]?.bodyMarkdown
));
assert.equal(problemDifficultyBars(9), 1);
assert.equal(problemDifficultyBars(10), 2);
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
assert.equal(problemDifficultyBars(25), 3);
assert.equal(problemDifficultyBars(50), 4);
assert.equal(problemDifficultyBars(70), 5);
assert.equal(problemDifficultyBars(90), 6);
assert.equal(problemDifficultyBars(100), 6);
assert.deepEqual([...HOME_GUEST_PROBLEM_GROUP_IDS], [
  "cmsivlyco002bqk01w80m0111",
  "cmsk3535w002pqk01x6f9lk7r",
  "cmsejcus20005pg014xgr58da",
  "cmsa48fhp0003mo01eevwb6r0"
]);
assert.deepEqual(
  sortHomeGuestProblemsByDifficulty([
    { id: 147, difficulty: 54, title: "Polynomes a coefficients premiers" },
    { id: 160, difficulty: 8, title: "La piece manquante" },
    { id: 176, difficulty: 22, title: "Plus qu'une minute pour cette integrale" },
    { id: 201, difficulty: 40, title: "Le probleme du parc" }
  ]).map(({ title }) => title),
  [
    "La piece manquante",
    "Plus qu'une minute pour cette integrale",
    "Le probleme du parc",
    "Polynomes a coefficients premiers"
  ]
);

const groupedTranslations = [
  { language: "fr", slug: "relations-de-viete" },
  { language: "es", slug: "relaciones-de-vieta" }
];
assert.equal(preferredTranslationForLanguage("en", groupedTranslations, "fr")?.slug, "relations-de-viete");
assert.equal(preferredTranslationForLanguage("fr", groupedTranslations, "fr"), null);
assert.equal(nextMissingTranslationLanguage("en", groupedTranslations, "fr"), null);
assert.equal(nextMissingTranslationLanguage("fr", [{ language: "es", slug: "relaciones-de-vieta" }], "it"), "en");
assert.deepEqual([...translationLanguageSet("en", groupedTranslations)], ["en", "fr", "es"]);
assert.equal(
  hrefWithTranslationViewLanguage("/problems?sort=new#results", "fr"),
  "/problems?sort=new&viewLanguage=fr#results"
);
assert.equal(
  hrefWithTranslationViewLanguage("/concepts/groupes?viewLanguage=fr", "en"),
  "/concepts/groupes?viewLanguage=en"
);
const fallbackTranslations = [
  { language: "fr", slug: "groupes", isSource: true },
  { language: "en", slug: "groups" },
  { language: "de", slug: "gruppen" }
];
assert.equal(selectContentTranslation(fallbackTranslations, "de")?.slug, "gruppen");
assert.equal(selectContentTranslation(fallbackTranslations, "it")?.slug, "groups");
assert.equal(
  selectContentTranslation(
    fallbackTranslations.filter((translation) => translation.language !== "en"),
    "it"
  )?.slug,
  "groupes"
);
assert.equal(
  selectContentTranslation(
    [
      { language: "fr", slug: "groupes", createdAt: new Date("2026-01-01") },
      { language: "de", slug: "gruppen", createdAt: new Date("2026-02-01") }
    ],
    "it"
  )?.slug,
  "groupes"
);
assert.deepEqual(
  selectContentTranslationsByGroup(
    [
      { translationGroupId: "a", language: "fr", slug: "groupes", isSource: true },
      { translationGroupId: "a", language: "en", slug: "groups" },
      { translationGroupId: "b", language: "fr", slug: "anneaux", isSource: true }
    ],
    "it"
  ).map(({ slug }) => slug),
  ["groups", "anneaux"]
);
assert.equal(selectExactContentTranslation(fallbackTranslations, "de")?.slug, "gruppen");
assert.equal(selectExactContentTranslation(fallbackTranslations, "it"), null);
assert.deepEqual(
  selectExactContentTranslationsByGroup(
    [
      { translationGroupId: "a", language: "fr", slug: "groupes", isSource: true },
      { translationGroupId: "a", language: "en", slug: "groups" },
      { translationGroupId: "b", language: "fr", slug: "anneaux", isSource: true }
    ],
    "en"
  ).map(({ slug }) => slug),
  ["groups"]
);
assert.deepEqual(ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code), ["en", "fr"]);
assert.deepEqual(FUTURE_CONTENT_LANGUAGES.map(({ code }) => code), ["es", "de", "it", "pt"]);
assert.deepEqual(ACTIVE_CONTENT_LANGUAGES.map(({ label }) => label), ["English", "Français"]);
assert.deepEqual(FUTURE_CONTENT_LANGUAGES.map(({ label }) => label), ["Español", "Deutsch", "Italiano", "Português"]);
assert.equal(contentLanguageLabel("fr"), "Français");
assert.equal(contentLanguageNativeLabel("pt"), "Português");
assert.equal(parseContentLanguage("es"), "es");
assert.equal(parseActiveContentLanguage("es"), "en");
assert.equal(isActiveContentLanguage("fr"), true);
assert.equal(isActiveContentLanguage("de"), false);
assert.equal(requireActiveContentLanguage("fr"), "fr");
assert.throws(() => requireActiveContentLanguage("es"), /English or Français only/);
assert.equal(editableContentLanguage("de", "de"), "de");
assert.throws(() => editableContentLanguage("es", "de"), /English or Français only/);
assert.equal(interfaceLocaleForContentLanguage("fr"), "fr");
assert.equal(interfaceLocaleForContentLanguage("es"), "en");
assert.equal(contentLanguageFallback("fr", "fr"), null);
assert.deepEqual(contentLanguageFallback("en", "fr"), {
  code: "EN",
  language: "en",
  label: "Disponible uniquement en anglais"
});
assert.deepEqual(contentLanguageFallback("fr", "en"), {
  code: "FR",
  language: "fr",
  label: "Available only in French"
});
assert.deepEqual(
  problemCreationNotificationCopy({
    actorName: "Sequoia",
    problemTitle: "Groups of order 6",
    targetLanguage: "en"
  }),
  {
    title: "New problem created",
    body: 'Sequoia created "Groups of order 6".'
  }
);
assert.deepEqual(
  conceptCreationNotificationCopy({
    actorName: "Sequoia",
    conceptTitle: "Compact space",
    targetLanguage: "en"
  }),
  {
    title: "New concept created",
    body: 'Sequoia created "Compact space".'
  }
);
assert.deepEqual(
  conceptCreationNotificationCopy({
    actorName: "Sequoia",
    conceptTitle: "Espace compact",
    sourceTitle: "Compact space",
    targetLanguage: "fr"
  }),
  {
    title: "New concept translation",
    body: 'Sequoia translated "Compact space" into Français as "Espace compact".'
  }
);
assert.deepEqual(
  problemCreationNotificationCopy({
    actorName: "Sequoia",
    problemTitle: "Groupes d'ordre 6",
    sourceTitle: "Groups of order 6",
    targetLanguage: "fr"
  }),
  {
    title: "New problem translation",
    body: 'Sequoia created a translation of "Groups of order 6" in Français titled "Groupes d\'ordre 6".'
  }
);
assert.equal(dictionaryForContentLanguage("fr").nav.problems, "Problèmes");
assert.equal(dictionaryForContentLanguage("fr").nav.tour, "Premiers pas sur Math Woods");
assert.equal(dictionaryForContentLanguage("fr").problemDetail.addFavorite, "J’aime ce problème");
assert.equal(dictionaryForContentLanguage("fr").problemDetail.favorited, "J’aime ce problème");
assert.equal(dictionaryForContentLanguage("fr").problemDetail.startAttempting, "Ajouter à ma liste");
assert.equal(dictionaryForContentLanguage("fr").guestProgressPrompt.signIn, "Se connecter");
assert.match(dictionaryForContentLanguage("fr").guestProgressPrompt.message, /progression/);
assert.equal(dictionaryForContentLanguage("en").guestProgressPrompt.close, "Close");
assert.equal(dictionaryForContentLanguage("en").problemDetail.addFavorite, "I like this problem");
assert.equal(dictionaryForContentLanguage("en").problemDetail.favorited, "I like this problem");
assert.equal(dictionaryForContentLanguage("en").problemDetail.startAttempting, "Add to my list");
assert.deepEqual(parseSelectedTranslationIds(["3", "2", "3", "bad", "0"]), [3, 2]);
assert.equal(translationBodyFieldName(TRANSLATED_PROOF_BODY_PREFIX, 17), "translatedProofBody:17");
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
  'A lire: <a class="wiki-link missing" href="/concepts/racine-primitive?missingTitle=racine%20primitive">racines primitives</a>.'
);
assert.equal(
  replaceWikiLinks("See [[norm]].", () => ({
    href: "/concepts/norme",
    language: "fr",
    expectedLanguage: "en"
  })),
  'See <a class="wiki-link" href="/concepts/norme">norm<sup aria-label="Available only in French" class="content-language-fallback" lang="fr" title="Available only in French">FR</sup></a>.'
);
assert.equal(
  missingConceptHref("Primitive root"),
  "/concepts/primitive-root?missingTitle=Primitive%20root"
);
assert.equal(wikiLinkMarkup("Category", "this is a category"), "[[Category|this is a category]]");
assert.equal(wikiLinkMarkup("Category", "Category"), "[[Category|Category]]");
assert.equal(
  makeWikiLinkLabelsExplicit("See [[Group theory]] and `[[Leave code alone]]`."),
  "See [[Group theory|Group theory]] and `[[Leave code alone]]`."
);
assert.equal(
  makeWikiLinkLabelsExplicit("See [[Group theory|groupes]] and [[Ring]]."),
  "See [[Group theory|groupes]] and [[Ring|Ring]]."
);
assert.equal(
  replaceWikiLinkLabels(
    "A [[Group|group]] and `[[Ring|ring]]`.",
    new Map([["group", "groupe"], ["ring", "anneau"]])
  ),
  "A [[Group|groupe]] and `[[Ring|ring]]`."
);
assert.equal(
  replaceWikiLinkLabels("[[Group]] and [[Unknown concept|unknown]].", new Map([["group", "Groupe"]])),
  "[[Group|Groupe]] and [[Unknown concept|unknown]]."
);
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
  knownSourceId: null,
  listed: true,
  isExercise: false,
  isConjecture: false,
  styles: [],
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
const legacySourceSnapshot = JSON.parse(JSON.stringify(baseProblemSnapshot));
delete legacySourceSnapshot.knownSourceId;
assert.equal(parseProblemRevisionSnapshot(legacySourceSnapshot)?.knownSourceId, null);
assert.equal(normalizeKnownProblemSourceName("  PHIL   Caldero "), "phil caldero");
assert.deepEqual(parseKnownProblemSourceAliases("Phil\n Phil Caldero,phil"), ["Phil", "Phil Caldero"]);
assert.equal(parseKnownProblemSourceIconSize(undefined), 40);
assert.equal(parseKnownProblemSourceIconSize(null), 40);
assert.equal(parseKnownProblemSourceIconSize(""), 40);
assert.equal(parseKnownProblemSourceIconSize("52"), 52);
assert.equal(parseKnownProblemSourceIconSize("10"), 24);
assert.equal(parseKnownProblemSourceIconSize("100"), 72);
assert.equal(
  problemOriginMatchesKnownSource(" phil  caldero ", { name: "Phil Caldero", aliases: [] }),
  true
);
assert.equal(problemSourcePresentation("Phil Caldero", { name: "Phil Caldero", aliases: [] }).sourceCount, 1);
assert.equal(problemSourcePresentation("Geometry Revisited", { name: "Phil Caldero", aliases: [] }).sourceCount, 2);
assert.equal(problemSourcePresentation("Geometry Revisited", null).sourceCount, 1);
assert.equal(problemSourcePresentation("Unknown", null).sourceCount, 0);
const legacyExerciseSnapshot = JSON.parse(JSON.stringify({
  ...baseProblemSnapshot,
  isExercise: true
}));
delete legacyExerciseSnapshot.showRelatedProblems;
assert.equal(
  parseProblemRevisionSnapshot(legacyExerciseSnapshot)?.showRelatedProblems,
  false
);
const baseConceptSnapshot: ConceptRevisionSnapshot = {
  schemaVersion: 1,
  title: "Group",
  language: "en",
  bodyMarkdown: "A group is...",
  domainCode: "algebra",
  kind: ConceptKind.DEFINITION,
  status: ConceptStatus.USABLE,
  needsReviewAfterEdit: false,
  canAppearInConceptBrowser: true,
  translatedFromRevisionId: null,
  aliases: [{ alias: "Groups", aliasSlug: "groups" }],
  references: [],
  practiceExercises: []
};
const editedConceptSnapshot: ConceptRevisionSnapshot = {
  ...baseConceptSnapshot,
  domainCode: "20-XX",
  aliases: [...baseConceptSnapshot.aliases, { alias: "Group structure", aliasSlug: "group-structure" }],
  practiceExercises: [{ id: 7, slug: "identity-is-unique", title: "Identity is unique" }]
};
assert.deepEqual(changedConceptSnapshotFields(baseConceptSnapshot, editedConceptSnapshot), [
  "domainCode",
  "aliases",
  "practiceExercises"
]);
assert.deepEqual(
  changedConceptSnapshotFields(editedConceptSnapshot, {
    ...editedConceptSnapshot,
    practiceExercises: [{ ...editedConceptSnapshot.practiceExercises[0], title: "Renamed exercise" }]
  }),
  []
);
assert.equal(
  conceptRevisionAutomaticSummary(changedConceptSnapshotFields(baseConceptSnapshot, editedConceptSnapshot)),
  "Updated domain, aliases and linked exercises"
);
assert.deepEqual(parseConceptRevisionSnapshot(baseConceptSnapshot), baseConceptSnapshot);
assert.equal(parseConceptRevisionSnapshot({ ...baseConceptSnapshot, schemaVersion: 2 }), null);
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
assert.deepEqual(orderedUniqueIds([4, 2, 4], [2, 7, 8]), [4, 2, 7, 8]);
assert.deepEqual(
  overlappingConceptLanguages(
    [{ id: 1, language: "fr" }, { id: 2, language: "en" }],
    [{ id: 3, language: "de" }, { id: 4, language: "fr" }]
  ),
  ["fr"]
);
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
assert.equal(chatDistanceFromBottom({ clientHeight: 400, scrollHeight: 1000, scrollTop: 520 }), 80);
assert.equal(chatIsNearBottom({ clientHeight: 400, scrollHeight: 1000, scrollTop: 520 }), false);
assert.equal(chatIsNearBottom({ clientHeight: 400, scrollHeight: 1000, scrollTop: 540 }), true);
assert.equal(chatScrollTopAfterPrepend(120, 1000, 1800), 920);
assert.equal(chatUnreadDocumentTitle("Math Woods", 1), "(1) Math Woods");
assert.equal(chatUnreadDocumentTitle("(1) Math Woods", 3), "(3) Math Woods");
assert.equal(chatUnreadDocumentTitle("(99+) Math Woods", 0), "Math Woods");
assert.equal(chatUnreadDocumentTitle("A problem - Math Woods", 120), "(99+) A problem - Math Woods");

const miniChatDraftValues = new Map<string, string>();
const miniChatDraftStorage = {
  getItem: (key: string) => miniChatDraftValues.get(key) ?? null,
  removeItem: (key: string) => {
    miniChatDraftValues.delete(key);
  },
  setItem: (key: string, value: string) => {
    miniChatDraftValues.set(key, value);
  }
};
assert.notEqual(miniChatDraftStorageKey(1, 2), miniChatDraftStorageKey(2, 1));
writeMiniChatDraft(miniChatDraftStorage, 1, 2, "A saved message");
assert.equal(readMiniChatDraft(miniChatDraftStorage, 1, 2), "A saved message");
assert.equal(readMiniChatDraft(miniChatDraftStorage, 1, 3), "");
writeMiniChatDraft(miniChatDraftStorage, 1, 2, "");
assert.equal(readMiniChatDraft(miniChatDraftStorage, 1, 2), "");
assert.equal(
  loginHrefForReturnTo("/problems/a-problem/translate?language=fr&task=problem%3A12%3Afr"),
  "/login?returnTo=%2Fproblems%2Fa-problem%2Ftranslate%3Flanguage%3Dfr%26task%3Dproblem%253A12%253Afr"
);
assert.equal(loginHrefForReturnTo("https://malicious.example"), "/login");
assert.equal(
  requestReturnToPath("/concepts/metric-space/translate", "?language=fr&_rsc=abc123"),
  "/concepts/metric-space/translate?language=fr"
);
assert.equal(shouldAcknowledgeChat({ conversationOpen: true, documentVisible: true, isAtBottom: true }), true);
assert.equal(shouldAcknowledgeChat({ conversationOpen: false, documentVisible: true, isAtBottom: true }), false);
assert.equal(shouldAcknowledgeChat({ conversationOpen: true, documentVisible: false, isAtBottom: true }), false);
assert.equal(shouldAcknowledgeChat({ conversationOpen: true, documentVisible: true, isAtBottom: false }), false);
assert.equal(
  canViewProblem(null, { authorId: 7, qualityStatus: QualityStatus.UNREVIEWED }),
  true
);
assert.deepEqual(visibleProblemWhere(null), {});
assert.equal(
  canViewProblemSolutions({
    requiresVerification: true,
    hasSolvedAttempt: false,
    canEditProblem: false
  }),
  false
);
assert.equal(
  canViewProblemSolutions({
    requiresVerification: true,
    hasSolvedAttempt: false,
    canEditProblem: false
  }),
  false
);
assert.equal(
  canViewProblemSolutions({
    requiresVerification: false,
    hasSolvedAttempt: false,
    canEditProblem: false
  }),
  true
);
assert.deepEqual(parseGuestContentViews(null), []);
assert.deepEqual(parseGuestContentViews("not-json"), []);
assert.deepEqual(parseGuestContentViews('["problem:1","problem:1","concept:2",3]'), ["problem:1", "concept:2"]);
assert.deepEqual(recordGuestContentView([], "problem:1"), {
  viewedKeys: ["problem:1"],
  requiresLogin: false
});
assert.deepEqual(recordGuestContentView(["problem:1", "concept:2"], "problem:1"), {
  viewedKeys: ["problem:1", "concept:2"],
  requiresLogin: false
});
assert.deepEqual(recordGuestContentView(["problem:1", "concept:2"], "problem:3"), {
  viewedKeys: ["problem:1", "concept:2", "problem:3"],
  requiresLogin: true
});
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
const joinedLineLatexText = " $x>0$    .";
const joinedLineLatexRange = findLatexRanges(joinedLineLatexText)[0];
assert.equal(
  rangeOverlapsLinesBetween(joinedLineLatexText, 0, 0, joinedLineLatexRange.from, joinedLineLatexRange.to),
  true
);
assert.equal(
  multilineSelectionOverlapsLatexLines(
    "Que vaut $x$ ?",
    "Que vaut $x$ ?".length,
    "Que vaut $x$ ?".length,
    9,
    12
  ),
  false
);
assert.equal(
  multilineSelectionOverlapsLatexLines("Que vaut $x$ ?", 0, 8, 9, 12),
  false
);
const directionalSelectionText = "Salut\nabc Truc $x>0$    .";
const directionalSelectionRange = findLatexRanges(directionalSelectionText)[0];
assert.equal(
  rangeOverlapsLinesBetween(
    directionalSelectionText,
    0,
    "Salut\nabc Truc".length,
    directionalSelectionRange.from,
    directionalSelectionRange.to
  ),
  true
);
assert.equal(
  multilineSelectionOverlapsLatexLines(
    directionalSelectionText,
    0,
    "Salut\nabc Truc".length,
    directionalSelectionRange.from,
    directionalSelectionRange.to
  ),
  true
);
assert.equal(
  rangeOverlapsLinesBetween(
    directionalSelectionText,
    "Salut\nabc Truc".length,
    0,
    directionalSelectionRange.from,
    directionalSelectionRange.to
  ),
  true
);
assert.equal(
  multilineSelectionOverlapsLatexLines(
    directionalSelectionText,
    "Salut\nabc Truc".length,
    0,
    directionalSelectionRange.from,
    directionalSelectionRange.to
  ),
  true
);
assert.equal(rangeOverlapsLinesBetween(`before\n${joinedLineLatexText}`, 0, 0, 8, 13), false);
const joinedLinePreviewState = EditorState.create({
  doc: directionalSelectionText,
  extensions: [suppressLatexPreviewAfterLineJoin]
});
const joinedLinePreviewTransaction = joinedLinePreviewState.update({
  changes: { from: 0, to: "Salut\nabc Truc".length }
});
assert.equal(joinedLinePreviewTransaction.state.field(suppressLatexPreviewAfterLineJoin), 0);
const joinedLineFocusTransaction = joinedLinePreviewTransaction.state.update({});
assert.equal(joinedLineFocusTransaction.state.field(suppressLatexPreviewAfterLineJoin), 0);
const joinedLineSelectionTransaction = joinedLineFocusTransaction.state.update({
  selection: { anchor: joinedLinePreviewTransaction.state.doc.length }
});
assert.equal(joinedLineSelectionTransaction.state.field(suppressLatexPreviewAfterLineJoin), null);
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
for (const range of ["1-10", "10-25", "25-50", "50-70", "70-90", "90-100"]) {
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
assert.equal(parseProblemStyle("trick question"), "TRICK_QUESTION");
assert.equal(parseProblemStyle("Contre-exemple"), "COUNTEREXAMPLE");
assert.deepEqual(parseProblemStyles(["PROOF", "proof", "VISUAL"]), ["PROOF", "VISUAL"]);
assert.deepEqual(problemStylesFromLegacyTagSlugs(["calculation", "geometry", "trick-question"]), [
  "CALCULATION",
  "TRICK_QUESTION"
]);
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
assert.equal(TRUSTED_USER_REPUTATION_THRESHOLD, 100);
assert.equal(isTrustedUserCandidate(Role.USER, 99), false);
assert.equal(isTrustedUserCandidate(Role.USER, 100), true);
assert.equal(isTrustedUserCandidate(Role.USER, 101), true);
assert.equal(isTrustedUserCandidate(Role.MODERATOR, 100), false);
assert.equal(isTrustedUserCandidate(Role.ADMIN, 500), false);
assert.equal(isTrustedUserCandidate(Role.USER, Number.NaN), false);
assert.equal(
  canEditSolution(
    { id: 12, role: Role.USER },
    { authorId: 4, translatedById: 12 }
  ),
  true
);
assert.equal(
  canEditSolution(
    { id: 13, role: Role.USER },
    { authorId: 4, translatedById: 12 }
  ),
  false
);
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
  false
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.MODERATOR },
    { createdById: 2, status: ConceptStatus.STUB },
    ConceptStatus.USABLE
  ),
  true
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.USER },
    { createdById: 1, status: ConceptStatus.USABLE },
    ConceptStatus.STUB
  ),
  true
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.USER },
    { createdById: 2, status: ConceptStatus.USABLE },
    ConceptStatus.STUB
  ),
  false
);
assert.equal(
  canChangeConceptStatus(
    { id: 1, role: Role.MODERATOR },
    { createdById: 1, status: ConceptStatus.REVIEWED },
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
assert.equal(canProposeProblemEdit({ id: 1, role: Role.USER, emailVerifiedAt: null }), false);
assert.equal(canProposeProblemEdit({ id: 1, role: Role.USER, emailVerifiedAt: new Date(0) }), true);
assert.equal(canProposeProblemEdit({ id: 1, role: Role.MODERATOR, emailVerifiedAt: null }), true);
assert.equal(canPublishProblemEdit({ id: 1, role: Role.USER }), false);
assert.equal(canPublishProblemEdit({ id: 1, role: Role.MODERATOR }), true);
assert.equal(canPublishProblemEdit({ id: 1, role: Role.ADMIN }), true);
assert.equal(canPublishProblemEditForTarget({ id: 1, role: Role.USER }, { authorId: 1 }, false), true);
assert.equal(canPublishProblemEditForTarget({ id: 1, role: Role.USER }, { authorId: 2 }, true), true);
assert.equal(canPublishProblemEditForTarget({ id: 1, role: Role.USER }, { authorId: 2 }, false), false);
assert.equal(canPublishProblemEditForTarget({ id: 1, role: Role.MODERATOR }, { authorId: 2 }, false), true);
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
assert.equal(markdownMarkupShouldRemainVisible("HeaderMark"), true);
assert.equal(markdownMarkupShouldRemainVisible("EmphasisMark"), false);
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
  anchor: 5
});
assert.deepEqual(latexTextInputShortcut("Before after\n$$y$$", 7, 7, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 7, to: 7, insert: "$$" },
  anchor: 8
});
assert.deepEqual(latexTextInputShortcut("Let x", 4, 5, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 4, to: 5, insert: "$x$" },
  anchor: 7
});
assert.deepEqual(latexTextInputShortcut("$", 1, 1, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 1, to: 1, insert: "$$" },
  anchor: 2
});
assert.deepEqual(latexTextInputShortcut("$$", 1, 1, "$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 1, to: 1, insert: "$$" },
  anchor: 2
});
assert.deepEqual(latexTextInputShortcut("Let ", 4, 4, "$$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 4, to: 4, insert: "$$" },
  anchor: 5
});
assert.deepEqual(latexTextInputShortcut("Let $$", 5, 5, "$$", DEFAULT_LATEX_PREFERENCES), {
  changes: { from: 5, to: 5, insert: "" },
  anchor: 6
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
assert.equal(MATH_WOODS_KATEX_MACROS["\\C"], "\\mathbb{C}");
const renderedLatexMacro = await renderMarkdown(String.raw`$\C + \R + \Z$`);
assert.match(renderedLatexMacro, /mathbb/);
assert.doesNotMatch(renderedLatexMacro, /katex-error/);

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
const renderedInlineLatexTitle = await renderInlineMarkdown("$K$-morphism");
assert.match(renderedInlineLatexTitle, /class="katex"/);
assert.match(renderedInlineLatexTitle, /-morphism$/);
assert.equal(renderedInlineLatexTitle.includes("$K$"), false);
const renderedLatexNotification = await renderInlineMarkdown(
  'alouette created "Une résolution géométrique de l’équation $x^3+a*x=b$".'
);
assert.match(renderedLatexNotification, /class="katex"/);
assert.equal(renderedLatexNotification.includes("$x^3+a*x=b$"), false);

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

const jsxGraphFoldState = EditorState.create({
  doc: `Before

\`\`\`jsxgraph
{
  "axis": true
}
\`\`\`

After`
});
const jsxGraphOpeningLine = jsxGraphFoldState.doc.line(3);
assert.deepEqual(jsxGraphFoldRangeAtLine(jsxGraphFoldState, jsxGraphOpeningLine.from), {
  from: jsxGraphOpeningLine.to,
  to: jsxGraphFoldState.doc.line(7).to
});
const ordinaryCodeFoldState = EditorState.create({ doc: "```json\n{}\n```" });
assert.equal(jsxGraphFoldRangeAtLine(ordinaryCodeFoldState, 0), null);
const incompleteJsxGraphFoldState = EditorState.create({ doc: "```jsxgraph\n{}" });
assert.equal(jsxGraphFoldRangeAtLine(incompleteJsxGraphFoldState, 0), null);
const tildeJsxGraphFoldState = EditorState.create({ doc: "~~~ JSXGRAPH\n{}\n~~~~" });
assert.deepEqual(jsxGraphFoldRangeAtLine(tildeJsxGraphFoldState, 0), {
  from: tildeJsxGraphFoldState.doc.line(1).to,
  to: tildeJsxGraphFoldState.doc.line(3).to
});

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
assert.equal(renderedMarkdownImage.includes('data-border="true"'), false);

const borderedMarkdownImageSrc = markdownImageSrcWithWidth(
  "https://images.mathwoods.org/uploads/diagram.png",
  65,
  true
);
assert.equal(borderedMarkdownImageSrc.endsWith("#mw-width-65&mw-border"), true);
assert.deepEqual(markdownImageSizingFromSrc(borderedMarkdownImageSrc), {
  src: "https://images.mathwoods.org/uploads/diagram.png",
  width: 65,
  bordered: true
});
const renderedBorderedMarkdownImage = await renderMarkdown(`![diagram](${borderedMarkdownImageSrc})`);
assert.equal(renderedBorderedMarkdownImage.includes('src="https://images.mathwoods.org/uploads/diagram.png"'), true);
assert.equal(renderedBorderedMarkdownImage.includes('style="width:65%;max-width:100%;height:auto"'), true);
assert.equal(renderedBorderedMarkdownImage.includes('data-border="true"'), true);

const renderedUnsafeMarkdownImage = await renderMarkdown("![bad](javascript:alert(1))");
assert.equal(renderedUnsafeMarkdownImage.includes("<img"), false);

const renderedExternalLink = await renderMarkdown("[external](https://example.com)");
assert.equal(renderedExternalLink.includes('href="https://example.com"'), true);
assert.equal(renderedExternalLink.includes('rel="noopener noreferrer nofollow ugc"'), true);
assert.equal(renderedExternalLink.includes('target="_blank"'), true);

const renderedProtocolRelativeLink = await renderMarkdown("[external](//example.com/path)");
assert.equal(renderedProtocolRelativeLink.includes('href="//example.com/path"'), false);

const combinedBrowserFilters = combineSearchFilters([
  { OR: [{ title: { contains: "fundamental group" } }, { bodyMarkdown: { contains: "fundamental group" } }] },
  { OR: [{ domainCode: "LOGIC" }, { domain: "LOGIC" }] }
]);
assert.deepEqual(combinedBrowserFilters, {
  AND: [
    { OR: [{ title: { contains: "fundamental group" } }, { bodyMarkdown: { contains: "fundamental group" } }] },
    { OR: [{ domainCode: "LOGIC" }, { domain: "LOGIC" }] }
  ]
});
assert.equal(
  searchFilterHref("/problems", "q=fundamental+group&quality=REVIEWED&page=3", "domain", "LOGIC"),
  "/problems?q=fundamental+group&quality=REVIEWED&domain=LOGIC"
);
assert.equal(
  searchFilterHref("/problems", "q=fundamental+group&domain=LOGIC", "domain"),
  "/problems?q=fundamental+group"
);

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
const editorCssSource = [
  readFileSync(join("app", "globals.css"), "utf-8"),
  ...readdirSync(join("app", "styles"))
    .filter((filename) => filename.endsWith(".css"))
    .sort()
    .map((filename) => readFileSync(join("app", "styles", filename), "utf-8"))
].join("\n");
const liveTitleEditorPaths = [
  join("app", "problems", "new", "page.tsx"),
  join("app", "problems", "[slug]", "edit", "page.tsx"),
  join("app", "concepts", "new", "page.tsx"),
  join("app", "concepts", "[slug]", "edit", "page.tsx")
];
for (const path of liveTitleEditorPaths) {
  const source = readFileSync(path, "utf-8");
  assert.match(source, /<LiveMarkdownTitleField\b/);
  assert.doesNotMatch(source, /<input\b[^>]*name=["']title["']/);
}
const liveTitleFieldSource = readFileSync(join("components", "LiveMarkdownTitleField.tsx"), "utf-8");
assert.match(liveTitleFieldSource, /mode=["']title["']/);
assert.doesNotMatch(liveTitleFieldSource, /title-preview/);
const markdownEditorSource = readFileSync(join("components", "markdown", "MarkdownEditor.tsx"), "utf-8");
assert.match(markdownEditorSource, /liveMarkdownPreviewExtension\(!titleMode\)/);
assert.match(markdownEditorSource, /transaction\.newDoc\.lines === 1/);
for (const path of [join("components", "NotificationsMenu.tsx"), join("app", "notifications", "page.tsx")]) {
  const source = readFileSync(path, "utf-8");
  assert.match(source, /localizeNotification\(notification, interfaceLocale\)/);
  assert.match(source, /<AsyncMarkdownInline markdown=\{localizedNotification\.body\}/);
}
const tourSource = readFileSync(join("components", "MathWoodsTour.tsx"), "utf-8");
const tourOverlaySource = readFileSync(join("components", "MathWoodsTourOverlay.tsx"), "utf-8");
const tourCopySource = readFileSync(join("lib", "math-woods-tour.ts"), "utf-8");
const layoutSource = readFileSync(join("app", "layout.tsx"), "utf-8");
const navigationFeedbackSource = readFileSync(join("components", "NavigationFeedback.tsx"), "utf-8");
const aboutPageSource = readFileSync(join("app", "about", "page.tsx"), "utf-8");
const legalPageSource = readFileSync(join("app", "legal", "page.tsx"), "utf-8");
const suggestionsPageSource = readFileSync(join("app", "suggestions", "page.tsx"), "utf-8");
const sitemapSource = readFileSync(join("app", "sitemap.ts"), "utf-8");
const guestProgressPromptSource = readFileSync(join("components", "GuestProgressPrompt.tsx"), "utf-8");
const guestContentGateSource = readFileSync(join("components", "GuestContentViewGate.tsx"), "utf-8");
const problemDetailSource = readFileSync(join("app", "problems", "[slug]", "page.tsx"), "utf-8");
const problemLedgerInteractiveRowSource = readFileSync(
  join("components", "ProblemLedgerInteractiveRow.tsx"),
  "utf-8"
);
const problemBrowserStateRouteSource = readFileSync(
  join("app", "api", "problems", "[problemId]", "browser-state", "route.ts"),
  "utf-8"
);
const solutionDiscussionSource = readFileSync(
  join("app", "problems", "[slug]", "proofs", "[proofId]", "discussion", "page.tsx"),
  "utf-8"
);
const proofActionsSource = readFileSync(join("lib", "actions", "proof-actions.ts"), "utf-8");
const createProofActionSource = proofActionsSource.match(
  /export async function createProofAction[\s\S]*?export async function saveSolutionHintAction/
)?.[0] ?? "";
const voteProofActionSource = proofActionsSource.match(
  /export async function voteProofAction[\s\S]*?export async function createProofCommentAction/
)?.[0] ?? "";
const problemActionsSource = readFileSync(join("lib", "actions", "problem-actions.ts"), "utf-8");
const removeProofSelfVotesMigrationSource = readFileSync(
  join("prisma", "migrations", "20260823104500_remove_automatic_proof_self_votes", "migration.sql"),
  "utf-8"
);
const disallowSolvedConjecturesMigrationSource = readFileSync(
  join("prisma", "migrations", "20260823111500_disallow_solved_conjectures", "migration.sql"),
  "utf-8"
);
const moderationActionsSource = readFileSync(join("lib", "actions", "moderation-actions.ts"), "utf-8");
const conceptDetailSource = readFileSync(join("app", "concepts", "[slug]", "page.tsx"), "utf-8");
const homeSource = readFileSync(join("app", "page.tsx"), "utf-8");
const homePrioritiesPageSource = readFileSync(join("app", "tips", "priorities", "page.tsx"), "utf-8");
const homePriorityActionsSource = readFileSync(join("lib", "actions", "home-priority-actions.ts"), "utf-8");
const tipsAdminTabsSource = readFileSync(join("components", "TipsAdminTabs.tsx"), "utf-8");
const problemBrowserSource = readFileSync(join("app", "problems", "page.tsx"), "utf-8");
const recommendedProblemReaderSource = readFileSync(join("components", "RecommendedProblemReader.tsx"), "utf-8");
const problemRecommendationActionsSource = readFileSync(
  join("lib", "actions", "problem-recommendation-actions.ts"),
  "utf-8"
);
const recommendationDismissalMigrationSource = readFileSync(
  join("prisma", "migrations", "20260825120000_add_recommendation_dismissals", "migration.sql"),
  "utf-8"
);
const conceptBrowserSource = readFileSync(join("app", "concepts", "page.tsx"), "utf-8");
const usersPageSource = readFileSync(join("app", "users", "page.tsx"), "utf-8");
const usersRankingSelectSource = readFileSync(join("app", "users", "UsersRankingSelect.tsx"), "utf-8");
const userReputationSource = readFileSync(join("lib", "user-reputation.ts"), "utf-8");
const rolesPageSource = readFileSync(join("app", "roles", "page.tsx"), "utf-8");
const rolesEditPageSource = readFileSync(join("app", "roles", "edit", "page.tsx"), "utf-8");
const rolesPageActionSource = readFileSync(join("lib", "actions", "roles-page-actions.ts"), "utf-8");
const faqSource = readFileSync(join("lib", "faq.ts"), "utf-8");
const frenchFaqSource = readFileSync(join("lib", "faq-fr.ts"), "utf-8");
const dailyProblemCardSource = readFileSync(join("components", "DailyProblemCard.tsx"), "utf-8");
const dailyTipCardSource = readFileSync(join("components", "DailyTipCard.tsx"), "utf-8");
const friendsMenuSource = readFileSync(join("components", "FriendsMenuClient.tsx"), "utf-8");
const loginSource = readFileSync(join("app", "login", "page.tsx"), "utf-8");
const oauthCompleteSource = readFileSync(join("app", "login", "complete", "page.tsx"), "utf-8");
const authActionsSource = readFileSync(join("lib", "actions", "auth-actions.ts"), "utf-8");
const oauthActionsSource = readFileSync(join("lib", "actions", "oauth-actions.ts"), "utf-8");
const languageSelectorSource = readFileSync(join("components", "LanguageSelector.tsx"), "utf-8");
const contributionTasksSource = readFileSync(join("app", "contributing", "tasks", "page.tsx"), "utf-8");
const contributionTaskRandomSource = readFileSync(join("app", "contributing", "tasks", "random", "route.ts"), "utf-8");
const siteImprovementsBoardSource = readFileSync(join("app", "contributing", "tasks", "site-improvements", "page.tsx"), "utf-8");
const siteImprovementDetailSource = readFileSync(join("app", "contributing", "tasks", "site-improvements", "[id]", "page.tsx"), "utf-8");
const siteImprovementActionsSource = readFileSync(join("lib", "actions", "site-improvement-actions.ts"), "utf-8");
const notificationsPageSource = readFileSync(join("app", "notifications", "page.tsx"), "utf-8");
const notificationLifecycleSource = readFileSync(join("lib", "notification-lifecycle.ts"), "utf-8");
const notificationCopySource = readFileSync(join("lib", "notification-copy.ts"), "utf-8");
const notificationsSource = readFileSync(join("lib", "notifications.ts"), "utf-8");
const siteAnnouncementActionsSource = readFileSync(join("lib", "actions", "site-announcement-actions.ts"), "utf-8");
const siteAnnouncementToastSource = readFileSync(join("components", "SiteAnnouncementToast.tsx"), "utf-8");
const moderationPageSource = readFileSync(join("app", "moderation", "page.tsx"), "utf-8");
const performancePageSource = readFileSync(join("app", "moderation", "performance", "page.tsx"), "utf-8");
const webVitalsReporterSource = readFileSync(join("components", "WebVitalsReporter.tsx"), "utf-8");
const problemChallengeDialogSource = readFileSync(join("components", "ProblemChallengeDialog.tsx"), "utf-8");
const conceptShareDialogSource = readFileSync(join("components", "ConceptShareDialog.tsx"), "utf-8");
const conceptShareActionsSource = readFileSync(join("lib", "actions", "concept-share-actions.ts"), "utf-8");
const webVitalsRouteSource = readFileSync(join("app", "api", "web-vitals", "route.ts"), "utf-8");
const internalMetricsRouteSource = readFileSync(join("app", "api", "internal", "metrics", "route.ts"), "utf-8");
const productionComposeSource = readFileSync("docker-compose.infomaniak.yml", "utf-8");
const caddySource = readFileSync(join("deploy", "Caddyfile"), "utf-8");
const prometheusConfigSource = readFileSync(join("deploy", "prometheus", "prometheus.yml"), "utf-8");
const prometheusAlertsSource = readFileSync(join("deploy", "prometheus", "alerts.yml"), "utf-8");
const productionDeploySource = readFileSync(join("deploy", "deploy.sh"), "utf-8");
const prismaSchemaSource = readFileSync(join("prisma", "schema.prisma"), "utf-8");
const conceptMergeActionsSource = readFileSync(join("lib", "actions", "concept-merge-actions.ts"), "utf-8");
const conceptActionsSource = readFileSync(join("lib", "actions", "concept-actions.ts"), "utf-8");
const conceptMergePageSource = readFileSync(join("app", "concepts", "[slug]", "merge", "page.tsx"), "utf-8");
const conceptMergeReviewSource = readFileSync(join("app", "moderation", "concept-merges", "[proposalId]", "page.tsx"), "utf-8");
const conceptHistorySource = readFileSync(join("app", "concepts", "[slug]", "history", "page.tsx"), "utf-8");
const conceptNewSource = readFileSync(join("app", "concepts", "new", "page.tsx"), "utf-8");
const conceptDuplicateSuggestionsSource = readFileSync(join("components", "ConceptDuplicateSuggestions.tsx"), "utf-8");
const internalLinksSource = readFileSync(join("lib", "internal-links.ts"), "utf-8");
const uniqueSlugSource = readFileSync(join("lib", "unique-slug.ts"), "utf-8");
assert.match(prismaSchemaSource, /model ProblemRecommendationExposure[\s\S]*?dismissedAt\s+DateTime\?/);
assert.match(recommendationDismissalMigrationSource, /ADD COLUMN "dismissedAt" TIMESTAMP\(3\)/);
assert.match(problemRecommendationActionsSource, /dismissProblemRecommendationAction[\s\S]*?dismissedAt: now/);
assert.match(problemRecommendationActionsSource, /undoProblemRecommendationDismissalAction[\s\S]*?dismissedAt: null/);
assert.match(recommendedProblemReaderSource, /EllipsisVertical/);
assert.match(recommendedProblemReaderSource, /setDismissedRecommendationReasonAction/);
assert.match(prismaSchemaSource, /dismissalReason\s+ProblemRecommendationDismissalReason\?/);
assert.match(recommendationDismissalMigrationSource, /NOT_INTERESTED_IN_DOMAIN/);
assert.match(recommendedProblemReaderSource, /ALREADY_KNOWN/);
assert.match(recommendedProblemReaderSource, /NOT_INTERESTED_IN_DOMAIN/);
assert.match(recommendedProblemReaderSource, /\/problems\/\$\{selected\.slug\}#report/);
assert.match(prismaSchemaSource, /model SiteAnnouncementRecipient[\s\S]*?@@id\(\[announcementId, userId\]\)/);
assert.match(prismaSchemaSource, /model ConceptRedirect[\s\S]*?sourceSlug\s+String\s+@unique/);
assert.match(prismaSchemaSource, /model ConceptMergeContributor[\s\S]*?@@id\(\[conceptId, userId\]\)/);
assert.match(conceptMergeActionsSource, /acquireTransactionLock\(tx, `concept-family:\$\{groupId\}`\)/);
assert.match(conceptActionsSource, /lockConceptFamilyForMutation/);
assert.match(conceptActionsSource, /acquireTransactionLock\(tx, `concept-family:\$\{concept\.translationGroupId\}`\)/);
assert.match(conceptMergeActionsSource, /tx\.conceptRedirect\.create/);
assert.match(conceptMergeActionsSource, /tx\.conceptTalkPost\.updateMany/);
assert.match(conceptMergeActionsSource, /tx\.playlistNode\.updateMany/);
assert.match(conceptMergeActionsSource, /tx\.explorationBlock\.updateMany/);
assert.match(conceptMergeActionsSource, /tx\.conceptMergeContributor\.createMany/);
assert.match(conceptMergeActionsSource, /remainingOverlap\.length === 0[\s\S]*?linkConceptGroups/);
assert.match(conceptMergePageSource, /proposeConceptMergeAction/);
assert.match(conceptMergeReviewSource, /mergeDuplicateConceptsAction/);
assert.match(conceptMergeReviewSource, /linkConceptTranslationGroupsAction/);
assert.match(conceptDetailSource, /prisma\.conceptRedirect\.findUnique/);
assert.match(conceptHistorySource, /mergedSource/);
assert.match(conceptHistorySource, /aria-label="Merged concept histories"/);
assert.match(conceptHistorySource, /user && !selectedMergedSource/);
assert.match(internalLinksSource, /tx\.conceptRedirect\.findUnique/);
assert.match(uniqueSlugSource, /prisma\.conceptRedirect\.findUnique/);
assert.match(conceptNewSource, /<ConceptDuplicateSuggestions/);
assert.match(conceptDuplicateSuggestionsSource, /all=1/);
assert.match(userReputationSource, /conceptMergeContributor\.findMany/);
assert.match(siteAnnouncementActionsSource, /const owner = await requireOwner\(\)/);
assert.match(siteAnnouncementActionsSource, /deletedAt: null,[\s\S]*?role: \{ in: audienceRoles \}/);
assert.match(siteAnnouncementActionsSource, /announcementId,[\s\S]*?userId: user\.id,[\s\S]*?acknowledgedAt: null/);
assert.match(siteAnnouncementToastSource, /acknowledgedAt: null/);
assert.match(siteAnnouncementToastSource, /announcement: \{ cancelledAt: null \}/);
assert.match(layoutSource, /<SiteAnnouncementToast userId=\{user\.id\} \/>/);
assert.match(moderationPageSource, /canUseOwnerTools\(user\)/);
assert.match(moderationPageSource, /action=\{sendSiteAnnouncementAction\}/);
assert.match(moderationPageSource, /\/moderation\/performance/);
assert.match(performancePageSource, /await requireOwner\(\)/);
assert.match(performancePageSource, /loadObservabilityDashboard\(range\)/);
assert.match(layoutSource, /<WebVitalsReporter \/>/);
assert.match(layoutSource, /<NavigationFeedback \/>/);
assert.match(navigationFeedbackSource, /event\.metaKey[\s\S]*?event\.ctrlKey[\s\S]*?event\.shiftKey/);
assert.match(navigationFeedbackSource, /destination\.origin !== window\.location\.origin/);
assert.match(navigationFeedbackSource, /destination\.pathname !== current\.pathname \|\| destination\.search !== current\.search/);
assert.match(navigationFeedbackSource, /NAVIGATION_FEEDBACK_TIMEOUT_MS/);
assert.match(editorCssSource, /data-navigation-feedback-active/);
assert.match(editorCssSource, /prefers-reduced-motion: reduce[\s\S]*?navigation-progress/);
assert.match(webVitalsReporterSource, /useReportWebVitals\(reportMetric\)/);
assert.match(webVitalsReporterSource, /normalizedObservabilityRoute\(window\.location\.pathname\)/);
assert.doesNotMatch(webVitalsReporterSource, /userId|username|userAgent/);
assert.match(
  problemChallengeDialogSource,
  /avatarBackground: suggestedUser\.avatarBackground,[\s\S]*?avatarUrl: suggestedUser\.avatarUrl/
);
assert.match(
  problemChallengeDialogSource,
  /avatarBackground: selectedRecipient\.avatarBackground,[\s\S]*?avatarUrl: selectedRecipient\.avatarUrl/
);
assert.match(problemActionsSource, /deleteProblemAction[\s\S]*?notifyAdminsOfProblemDeletion/);
assert.match(notificationsSource, /notifyAdminsOfProblemDeletion[\s\S]*?Role\.ADMIN, Role\.OWNER/);
assert.match(notificationsSource, /NotificationType\.PROBLEM_DELETED[\s\S]*?\/problems\/\$\{problemSlug\}\/history/);
assert.match(conceptDetailSource, /<ConceptShareLauncher/);
assert.match(conceptShareActionsSource, /NotificationType\.CONCEPT_SHARED/);
assert.match(conceptShareActionsSource, /createdAt: \{ gte: new Date\(Date\.now\(\) - 5 \* 60_000\) \}/);
assert.match(
  conceptShareDialogSource,
  /avatarBackground: suggestedUser\.avatarBackground,[\s\S]*?avatarUrl: suggestedUser\.avatarUrl/
);
assert.match(webVitalsRouteSource, /assertRateLimit/);
assert.match(webVitalsRouteSource, /normalizedObservabilityRoute/);
assert.match(internalMetricsRouteSource, /registry\.metrics\(\)/);
assert.match(productionComposeSource, /prom\/prometheus:v3\.12\.0/);
assert.match(productionComposeSource, /prom\/node-exporter:v1\.12\.1/);
assert.match(productionComposeSource, /ghcr\.io\/google\/cadvisor:v0\.60\.5/);
assert.match(productionComposeSource, /--storage\.tsdb\.retention\.time=30d/);
assert.match(productionComposeSource, /--storage\.tsdb\.retention\.size=2GB/);
assert.doesNotMatch(productionComposeSource, /"(?:9090|9100|8080):(?:9090|9100|8080)"/);
assert.match(caddySource, /@internalMetrics path \/api\/internal\/metrics[\s\S]*?respond @internalMetrics 404/);
assert.match(prometheusConfigSource, /job_name: math-woods-app/);
assert.match(prometheusConfigSource, /job_name: node/);
assert.match(prometheusConfigSource, /job_name: containers/);
assert.match(prometheusAlertsSource, /alert: HostDiskHigh/);
assert.match(prometheusAlertsSource, /handler="subroute"/);
assert.doesNotMatch(prometheusAlertsSource, /handler="reverse_proxy"/);
assert.match(productionDeploySource, /kill -s SIGHUP prometheus/);
assert.equal(
  (moderationPageSource.match(/name="audienceRoles"[^>]*defaultChecked/g) ?? []).length,
  1,
);
assert.match(
  moderationPageSource,
  /name="audienceRoles"[^>]*value=\{Role\.OWNER\}[^>]*defaultChecked/,
);
assert.doesNotMatch(
  moderationPageSource,
  /name="audienceRoles"[^>]*value=\{Role\.(?:USER|MODERATOR|ADMIN)\}[^>]*defaultChecked/,
);
assert.match(layoutSource, /\/about\/tutorial/);
assert.doesNotMatch(layoutSource, /href=[^\n]*\/suggestions/);
assert.doesNotMatch(aboutPageSource, /href=[^\n]*\/suggestions/);
assert.doesNotMatch(legalPageSource, /href=[^\n]*\/suggestions/);
assert.doesNotMatch(sitemapSource, /absoluteUrl\("\/suggestions"\)/);
assert.match(
  suggestionsPageSource,
  /permanentRedirect\("\/contributing\/tasks\/site-improvements"\)/
);
assert.match(layoutSource, /<GuestProgressPrompt \/>/);
assert.match(guestProgressPromptSource, /dictionaryForLocale/);
assert.doesNotMatch(guestProgressPromptSource, /Sign in to record your progress/);
assert.match(guestContentGateSource, /window\.location\.replace/);
assert.match(problemDetailSource, /contentKey=\{`problem:\$\{problem\.translationGroupId\}`\}/);
assert.match(conceptBrowserSource, /name="missingTranslation"/);
assert.match(conceptBrowserSource, /translationGroupId: \{ notIn: translatedGroupIds \}/);
assert.match(
  conceptBrowserSource,
  /contentLanguageViewHref\("\/concepts", concept\.slug, concept\.language\)/,
);
assert.match(problemDetailSource, /<strong>\{t\.problemDetail\.markSolved\}<\/strong>/);
assert.match(problemDetailSource, /href=\{problemSignInHref as never\}/);
assert.match(problemDetailSource, /!isConjecture && \(user \?/);
assert.match(problemDetailSource, /problem-primary-actions\$\{isConjecture \? " conjecture" : ""\}/);
assert.match(problemDetailSource, /startAttemptAction\.bind/);
assert.match(problemDetailSource, /unmarkProblemAttemptAction\.bind/);
assert.match(problemDetailSource, /toggleProblemFavoriteAction\.bind/);
assert.match(problemBrowserSource, /isConjecture=\{problem\.isConjecture\}/);
assert.match(problemLedgerInteractiveRowSource, /!isConjecture && \(!signedIn \?/);
assert.match(problemBrowserStateRouteSource, /operation === "solve" && problem\.isConjecture/);
assert.match(problemBrowserStateRouteSource, /Conjectures cannot be marked as solved/);
assert.ok(
  (problemActionsSource.match(/Conjectures cannot be marked as solved/g) ?? []).length >= 2,
  "direct solving and verification approval must reject conjectures"
);
assert.match(disallowSolvedConjecturesMigrationSource, /problem\."isConjecture" = TRUE/);
assert.match(disallowSolvedConjecturesMigrationSource, /"status" = 'STARTED'::"AttemptStatus"/);
assert.match(editorCssSource, /\.problem-primary-actions\.conjecture[\s\S]*?grid-template-columns: 1fr 1fr/);
assert.match(problemDetailSource, /proofs\/\$\{proof\.id\}\/discussion/);
assert.match(problemDetailSource, /_count: \{ select: \{ comments: true \} \}/);
assert.doesNotMatch(problemDetailSource, /reportProofAction/);
assert.doesNotMatch(problemDetailSource, /className="solution-report-control"/);
assert.match(solutionDiscussionSource, /createProofCommentAction/);
assert.match(solutionDiscussionSource, /reportProofAction/);
assert.match(solutionDiscussionSource, /canViewProblemSolutions/);
assert.match(solutionDiscussionSource, /canViewArchivedProblem/);
assert.match(proofActionsSource, /proof\.problem\.slug !== problemSlug/);
assert.match(proofActionsSource, /proofs\/\$\{proofId\}\/discussion/);
assert.doesNotMatch(createProofActionSource, /tx\.vote\.(?:create|upsert)/);
assert.match(voteProofActionSource, /proof\.authorId === user\.id \|\| proof\.translatedById === user\.id/);
assert.doesNotMatch(voteProofActionSource, /proof\.authorId === user\.id[\s\S]*?prisma\.vote\.upsert/);
assert.doesNotMatch(problemDetailSource, /ownSolutionVoteLocked/);
assert.doesNotMatch(problemActionsSource, /userId: sourceProof\.authorId,[\s\S]*?targetId: translatedProof\.id/);
assert.match(removeProofSelfVotesMigrationSource, /vote\."userId" = proof\."authorId"/);
assert.match(removeProofSelfVotesMigrationSource, /vote\."userId" = proof\."translatedById"/);
assert.match(moderationActionsSource, /proofs\/\$\{proofId\}\/discussion\?report=saved/);
assert.match(conceptDetailSource, /contentKey=\{`concept:\$\{concept\.translationGroupId\}`\}/);
assert.match(homeSource, /\/about\/tutorial/);
assert.equal((homeSource.match(/\{prioritiesCard\}/g) ?? []).length, 2);
assert.match(homeSource, /href="\/contributing" className="mw-primary-button"/);
assert.match(editorCssSource, /@media \(max-width: 700px\)[\s\S]*?\.home-priorities-body > div[\s\S]*?flex-basis: 100%/);
assert.match(homePrioritiesPageSource, /canUseAdminTools\(user\)/);
assert.match(homePrioritiesPageSource, /TipsAdminTabs active="priorities"/);
assert.match(homePriorityActionsSource, /prisma\.homePriorityContent\.upsert/);
assert.match(homePriorityActionsSource, /revalidatePath\("\/"\)/);
assert.match(tipsAdminTabsSource, /\/tips\/priorities/);
assert.equal(homePriorityForLocale(null, "fr"), DEFAULT_HOME_PRIORITIES.fr);
assert.deepEqual(
  homePriorityForLocale({ language: "fr", title: "À relire", body: "Trois pages cette semaine." }, "fr"),
  { language: "fr", title: "À relire", body: "Trois pages cette semaine." }
);
assert.equal(
  homePriorityForLocale({ language: "en", title: "English", body: "Text" }, "fr"),
  DEFAULT_HOME_PRIORITIES.fr
);
assert.match(
  homeSource,
  /className="home-resume-prefix"\>\{t\.home\.hero\.resume\}\<\/span\>/,
);
assert.match(homeSource, /AsyncMarkdownInline markdown=\{resumeProblem\.title\} className="home-resume-title"/);
assert.match(editorCssSource, /\.home-resume-title \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
assert.doesNotMatch(homeSource, /t\.home\.hero\.resume\(resumeProblem\.title\)/);
assert.match(oauthCompleteSource, /name="displayName"[\s\S]*?autoComplete="nickname"/);
assert.doesNotMatch(oauthCompleteSource, /defaultValue=\{attempt\.providerDisplayName/);
assert.match(oauthCompleteSource, /complete\.publicPseudonymHelp/);
assert.doesNotMatch(loginSource, /name="discoverySource(?:Detail)?"/);
assert.doesNotMatch(oauthCompleteSource, /name="discoverySource(?:Detail)?"/);
assert.doesNotMatch(authActionsSource, /formData\.get\("discoverySource(?:Detail)?"\)/);
assert.doesNotMatch(oauthActionsSource, /formData\.get\("discoverySource(?:Detail)?"\)/);
assert.match(languageSelectorSource, /window\.history\.replaceState\(window\.history\.state/);
assert.match(languageSelectorSource, /router\.push\(hrefWithTranslationViewLanguage/);
assert.doesNotMatch(languageSelectorSource, /router\.replace\(/);
assert.match(layoutSource, /nav-menu-tour-divider[\s\S]*?nav-menu-tour-link/);
assert.match(tourSource, /\[MATH_WOODS_TOUR_PARAM\]: "1"/);
assert.match(tourSource, /router\.push\(`\/\?\$\{params\.toString\(\)\}`\)/);
assert.doesNotMatch(tourSource, /TourHome|TourProblemList|TourProblem/);
assert.match(tourOverlaySource, /MutationObserver/);
assert.match(tourOverlaySource, /window\.history\.replaceState/);
assert.match(tourOverlaySource, /event\.preventDefault\(\)/);
assert.match(tourOverlaySource, /math-tour-live-target-interactive/);
assert.match(tourOverlaySource, /details:not\(\[open\]\)/);
assert.match(tourOverlaySource, /event\.key !== "Tab"/);
assert.match(tourOverlaySource, /aria-modal="true"/);
assert.match(tourCopySource, /véritables pages du site/);
assert.match(tourCopySource, /site's real pages directly/);
assert.doesNotMatch(tourCopySource, /Ancient Tree/);
assert.doesNotMatch(tourCopySource, /cr[ée]ateur du site/);
assert.doesNotMatch(tourCopySource, /tutoriel est bient[oô]t fini/i);
assert.doesNotMatch(tourCopySource, /tr[êe]ve de plaisanterie/i);
assert.doesNotMatch(tourCopySource, /accès aux suggestions|link for suggestions/i);
assert.equal(mathWoodsTourCopy.fr.steps.length, 17);
assert.equal(mathWoodsTourCopy.en.steps.length, 17);
assert.equal(parseMathWoodsTourStep("-3", 17), 0);
assert.equal(parseMathWoodsTourStep("99", 17), 16);
assert.match(layoutSource, /data-tour-target="nav-problems"/);
assert.match(layoutSource, /data-tour-target="nav-concepts"/);
assert.match(layoutSource, /data-tour-target="menu"/);
assert.match(layoutSource, /<MathWoodsTourOverlay/);
assert.match(dailyProblemCardSource, /data-tour-target="daily"/);
assert.match(dailyTipCardSource, /data-tour-target="tip"/);
assert.match(homeSource, /data-tour-target="progress"/);
assert.match(homeSource, /data-tour-target="recommendations"/);
assert.match(homeSource, /data-tour-target="friends"/);
assert.match(friendsMenuSource, /data-tour-target="chat"/);
assert.match(problemBrowserSource, /data-tour-target="problem-browser"/);
assert.match(problemBrowserSource, /data-tour-target=\{problemIndex === 0 \? "open-problem"/);
assert.match(problemDetailSource, /data-tour-target="statement"/);
assert.match(problemDetailSource, /data-tour-target="help"/);
assert.match(problemDetailSource, /user && queryParams\.recommended === "1" && !tourMode && !isOwnProblem/);
assert.match(guestProgressPromptSource, /searchParams\.get\("tour"\) !== "1"/);
assert.match(guestContentGateSource, /searchParams\.get\("tour"\) === "1"/);
assert.match(usersPageSource, /const USERS_PER_PAGE = 25/);
assert.match(usersPageSource, /users\.slice\(firstUserIndex, firstUserIndex \+ USERS_PER_PAGE\)/);
assert.match(usersPageSource, /firstUserIndex \+ index \+ 1/);
assert.match(usersPageSource, /name="q"/);
assert.match(usersPageSource, /normalizeSearchText/);
assert.match(usersPageSource, /usersHref\(mode, currentPage \+ 1, searchQuery\)/);
assert.match(usersPageSource, /user\.translationCount/);
assert.match(usersPageSource, /mode === "translations"/);
assert.match(usersRankingSelectSource, /new URLSearchParams\(searchParams\.toString\(\)\)/);
assert.match(usersRankingSelectSource, /nextParams\.delete\("page"\)/);
assert.match(contributionTasksSource, /canUseModerationTools\(user\)/);
assert.match(contributionTasksSource, /problem\.isExercise && problem\._count\.conceptExerciseLinks === 0/);
assert.match(contributionTaskRandomSource, /isExercise: true, conceptExerciseLinks: \{ none: \{\} \}/);
assert.match(siteImprovementsBoardSource, /requireModerator\(\)/);
assert.match(siteImprovementDetailSource, /requireModerator\(\)/);
assert.equal(
  (siteImprovementActionsSource.match(/await requireModerator\(\)/g) ?? []).length,
  5,
  "every site-improvement mutation must enforce trusted access server-side"
);
assert.match(siteImprovementActionsSource, /updateSiteImprovementMetadataAction[\s\S]*?parseSiteImprovementStatus[\s\S]*?parseSiteImprovementPriority/);
assert.match(prismaSchemaSource, /enum SiteImprovementStatus \{[\s\S]*?BACKLOG[\s\S]*?LONG_TERM[\s\S]*?PLANNED/);
assert.match(siteImprovementDetailSource, /SITE_IMPROVEMENT_STATUS_ORDER\.map/);
assert.match(siteImprovementDetailSource, /action=\{updateSiteImprovementMetadataAction\.bind/);
assert.doesNotMatch(siteImprovementsBoardSource, /eyebrow=\{copy\.eyebrow\}|description=\{copy\.description\}|activeItems\.length/);
assert.match(siteImprovementsBoardSource, /id="new-site-improvement"[\s\S]*?open=\{query\.new === "1"\}/);
assert.match(siteImprovementDetailSource, /deleteSiteImprovementAction\.bind/);
assert.match(siteImprovementDetailSource, /<ConfirmSubmitButton[\s\S]*?copy\.confirmDelete/);
assert.match(siteImprovementActionsSource, /deleteSiteImprovementAction[\s\S]*?Only the creator or an admin/);
assert.match(siteImprovementActionsSource, /NotificationType\.SITE_IMPROVEMENT_COMPLETED/);
assert.match(
  siteImprovementActionsSource,
  /statusChanged && !canUseOwnerTools\(user\)[\s\S]*?Only the owner can change a site improvement status/
);
assert.match(siteImprovementDetailSource, /const canChangeStatus = canUseOwnerTools\(user\)/);
assert.match(siteImprovementDetailSource, /canChangeStatus \? \([\s\S]*?<select name="status"/);
assert.match(siteImprovementDetailSource, /<input type="hidden" name="status" value=\{improvement\.status\}/);
assert.match(siteImprovementActionsSource, /respondToSiteImprovementCompletionAction/);
assert.match(siteImprovementActionsSource, /respondToSiteImprovementCompletionAction[\s\S]*?await requireUser\(\)/);
assert.match(notificationsPageSource, /respondToSiteImprovementCompletionAction\.bind\(null, improvementReview\.id, "confirm"\)/);
assert.match(notificationsPageSource, /respondToSiteImprovementCompletionAction\.bind\(null, improvementReview\.id, "follow-up"\)/);
assert.match(notificationLifecycleSource, /siteImprovementReview:[\s\S]*?SiteImprovementCompletionReviewStatus\.PENDING/);
assert.match(notificationCopySource, /Votre suggestion a bien été prise en compte/);
const notificationActor = { username: "alouette", displayName: "Alouette" };
const usefulVoteNotification = localizeNotification({
  type: NotificationType.SOLUTION_VOTED,
  title: "Your solution received a useful vote",
  body: 'Alouette marked your solution to "Une intégrale $I$" as useful.',
  actor: notificationActor
}, "fr");
assert.equal(usefulVoteNotification.title, "Votre solution a été jugée utile");
assert.equal(
  usefulVoteNotification.body,
  "Alouette a marqué votre solution à « Une intégrale $I$ » comme utile."
);
const problemEditedNotification = localizeNotification({
  type: NotificationType.PROBLEM_EDITED,
  title: "Problem edited",
  body: 'Alouette edited "Une intégrale $I$". Changed: statement, difficulty. Summary: Clarified the bound.',
  actor: notificationActor
}, "fr");
assert.equal(problemEditedNotification.title, "Problème modifié");
assert.match(problemEditedNotification.body, /Champs modifiés : énoncé, difficulté\./);
assert.match(problemEditedNotification.body, /Résumé : Clarified the bound\./);
const problemDeletedNotification = localizeNotification({
  type: NotificationType.PROBLEM_DELETED,
  title: "Problem deleted",
  body: 'Alouette deleted "Une intégrale $I$".',
  actor: notificationActor
}, "fr");
assert.deepEqual(problemDeletedNotification, {
  title: "Problème supprimé",
  body: "Alouette a supprimé « Une intégrale $I$ »."
});
const challengeNotification = localizeNotification({
  type: NotificationType.PROBLEM_CHALLENGE,
  title: "New challenge",
  body: 'Alouette challenged you to solve "Une intégrale $I$". Bonne chance !',
  actor: notificationActor
}, "fr");
assert.equal(challengeNotification.title, "Nouveau défi");
assert.match(challengeNotification.body, /Bonne chance !$/);
const problemShareLocalizedNotification = localizeNotification({
  type: NotificationType.PROBLEM_SHARED,
  title: "A problem was shared with you",
  body: 'Alouette shared the problem "Une intégrale" with you. À voir !',
  actor: notificationActor
}, "fr");
assert.match(problemShareLocalizedNotification.body, /À voir !$/);
const conceptShareNotification = localizeNotification({
  type: NotificationType.CONCEPT_SHARED,
  title: "A concept was shared with you",
  body: 'Alouette shared the concept "Espace compact" with you. Cela peut vous aider.',
  actor: notificationActor
}, "fr");
assert.equal(conceptShareNotification.title, "Un concept a été partagé avec vous");
assert.equal(
  conceptShareNotification.body,
  "Alouette a partagé avec vous le concept « Espace compact ». Cela peut vous aider."
);
const conceptTranslationNotification = localizeNotification({
  type: NotificationType.CONCEPT_CREATED,
  title: "New concept translation",
  body: 'Alouette translated "Compact space" into Français as "Espace compact".',
  actor: notificationActor
}, "fr");
assert.deepEqual(conceptTranslationNotification, {
  title: "Nouvelle traduction d’un concept",
  body: "Alouette a traduit « Compact space » en français sous le titre « Espace compact »."
});
assert.deepEqual(
  localizeNotification({
    type: NotificationType.SOLUTION_VOTED,
    title: "Your solution received a useful vote",
    body: "Stored English body",
    actor: notificationActor
  }, "en"),
  { title: "Your solution received a useful vote", body: "Stored English body" }
);
for (const type of Object.values(NotificationType)) {
  const localized = localizeNotification({
    type,
    title: "Untranslated notification title",
    body: 'Alouette edited "Example content".',
    actor: notificationActor
  }, "fr");
  assert.ok(localized.title, `${type} must have a French title`);
  assert.notEqual(localized.title, "Untranslated notification title", `${type} must not retain its English title`);
  assert.ok(localized.body, `${type} must have a body`);
}
assert.match(prismaSchemaSource, /model SiteImprovementCompletionReview[\s\S]*?notificationId\s+Int\?\s+@unique/);
assert.doesNotMatch(siteImprovementDetailSource, /site-improvement-sidebar|titleBelowHero/);
assert.match(siteImprovementDetailSource, /<details className="site-improvement-comment-composer">/);
assert.match(siteImprovementDetailSource, /<details className="site-improvement-history-panel">/);
assert.doesNotMatch(siteImprovementsBoardSource, /<UserName|copy\.createdBy/);
assert.doesNotMatch(siteImprovementActionsSource, /claimSiteImprovementAction|releaseSiteImprovementAction|assigneeId/);
assert.doesNotMatch(siteImprovementsBoardSource, /claimSiteImprovementAction|releaseSiteImprovementAction|assignee/);
assert.doesNotMatch(siteImprovementDetailSource, /claimSiteImprovementAction|releaseSiteImprovementAction|assignee/);
assert.doesNotMatch(prismaSchemaSource, /siteImprovementsAssigned|SiteImprovementAssignee|ASSIGNEE_CHANGED/);
assert.doesNotMatch(homeSource, /RecommendationDifficultyControl|recommendations\/easier/);
assert.doesNotMatch(problemBrowserSource, /RecommendationDifficultyControl|recommendations\/easier/);
assert.doesNotMatch(prismaSchemaSource, /EASIER_REQUESTED/);
assert.equal(existsSync(join("app", "api", "recommendations", "easier", "route.ts")), false);
assert.doesNotMatch(userReputationSource, /emailVerifiedAt:\s*\{\s*not:\s*null/);
assert.match(faqSource, /\[Roles page\]\(\/roles\)/);
assert.match(frenchFaqSource, /\[page Rôles\]\(\/roles\)/);
assert.doesNotMatch(layoutSource, /href=\{?["']\/roles["']/);
assert.match(rolesPageSource, /roles-markdown-frame/);
assert.match(rolesPageSource, /canUseAdminTools/);
assert.match(rolesEditPageSource, /<MarkdownEditor/);
assert.match(rolesPageActionSource, /rolesPageContent\.upsert/);
assert.match(rolesPageActionSource, /boundedText\([\s\S]*?trim: false/);
const latexDisplayRule = editorCssSource.match(/\.markdown-editor \.cm-latex-display \{([^}]*)\}/)?.[1] ?? "";
assert.match(latexDisplayRule, /display:\s*inline-block/);
assert.doesNotMatch(latexDisplayRule, /display:\s*block/);
assert.doesNotMatch(latexDisplayRule, /overflow-x:\s*auto/);
assert.match(editorCssSource, /\.markdown-editor \.cm-latex-display-line \{\s*text-align:\s*center;/);
assert.match(editorCssSource, /\.prose-math \.katex-display \{\s*margin:\s*0\.4em 0;/);
const difficultyNumberRule = editorCssSource.match(/\.mw-difficulty strong \{([^}]*)\}/)?.[1] ?? "";
assert.match(difficultyNumberRule, /font-variant-numeric:\s*tabular-nums/);
assert.match(difficultyNumberRule, /min-width:\s*3ch/);
assert.match(editorCssSource, /--mw-difficulty-column-width:\s*70px/);
assert.match(
  editorCssSource,
  /\.home-news-list > a \{[^}]*grid-template-columns:\s*var\(--mw-difficulty-column-width\) minmax\(0, 1fr\) auto;/s
);
assert.match(
  editorCssSource,
  /\.problem-ledger-content \{[^}]*grid-template-columns:\s*var\(--mw-difficulty-column-width\) minmax\(0, 1fr\)/s
);
assert.doesNotMatch(editorCssSource, /grid-template-columns:\s*(?:40|46|48|52|60)px minmax\(0, 1fr\)/);
assert.match(editorCssSource, /\.field-help::after \{[^}]*white-space:\s*pre-line;/s);
assert.equal(fr.contentEditor.difficultyHelp.split("\n").length, 7);
assert.equal(en.contentEditor.difficultyHelp.split("\n").length, 7);

assert.equal(sanitizeReportPath("/edit?token=secret#draft"), "/edit");
assert.equal(sanitizeReportPath("https://mathwoods.org/problem/one?email=a@example.com"), "https://mathwoods.org/problem/one");
const requestHeaders = (values: Record<string, string>) => ({
  get(name: string) {
    return values[name.toLowerCase()] ?? null;
  }
});
assert.equal(clientAddressFromHeaders(requestHeaders({ "x-forwarded-for": "203.0.113.8, 10.0.0.2" })), "203.0.113.8");
assert.equal(clientAddressFromHeaders(requestHeaders({ "x-forwarded-for": "invalid", "x-real-ip": "2001:db8::2" })), "2001:db8::2");
assert.equal(clientAddressFromHeaders(requestHeaders({ "x-forwarded-for": "invalid" })), "unknown");
assert.equal(secretsMatch("same-secret", "same-secret"), true);
assert.equal(secretsMatch("wrong-secret", "same-secret"), false);
assert.equal(secretsMatch(null, "same-secret"), false);

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
const staleRuntimeError = new TypeError("e[o] is not a function");
assert.equal(isClientBundleError(staleChunkError), true);
assert.equal(isClientBundleError(staleRuntimeError), true);
assert.equal(clientBundleErrorSignature(staleRuntimeError), "module-runtime-mismatch");
assert.equal(shouldReloadForClientBundleError(staleRuntimeError, null, 10_000), true);
assert.equal(shouldReloadForClientBundleError(staleRuntimeError, "10000", 10_001), false);
assert.equal(
  shouldReloadForClientBundleError(
    staleRuntimeError,
    "10000",
    10_000 + CLIENT_BUNDLE_RELOAD_COOLDOWN_MS
  ),
  true
);
assert.equal(shouldReloadForClientBundleError(new Error("Ordinary render failure"), null), false);

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

const originalContentImage = await sharp({
  create: { width: 1200, height: 800, channels: 3, background: "#f8f6ef" }
}).jpeg({ quality: 100 }).toBuffer();
const preservedContentImage = await processContentImage(
  new File([Uint8Array.from(originalContentImage)], "photo.jpg", { type: "image/jpeg" })
);
assert.equal(preservedContentImage.width, 1200);
assert.equal(preservedContentImage.height, 800);
assert.deepEqual(preservedContentImage.body, originalContentImage);

const highResolutionTipImage = await sharp({
  create: { width: 2228, height: 2143, channels: 4, background: "#ffffff" }
}).png().toBuffer();
const preservedTipImage = await processContentImage(
  new File([Uint8Array.from(highResolutionTipImage)], "tip.png", { type: "image/png" })
);
assert.equal(preservedTipImage.width, 2228);
assert.equal(preservedTipImage.height, 2143);
assert.deepEqual(preservedTipImage.body, highResolutionTipImage);

const oversizedContentImage = await sharp({
  create: { width: 3000, height: 1200, channels: 3, background: "#f8f6ef" }
}).png().toBuffer();
const processedContentImage = await processContentImage(
  new File([Uint8Array.from(oversizedContentImage)], "diagram.png", { type: "image/png" })
);
assert.equal(processedContentImage.contentType, "image/png");
assert.equal(processedContentImage.width, 2560);
assert.equal(processedContentImage.height, 1024);

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
const tipImages = [
  { imageUrl: "/one.jpg", imagePositionX: 20, imagePositionY: 30 },
  { imageUrl: "/two.jpg", imagePositionX: 40, imagePositionY: 50 },
  { imageUrl: "/three.jpg", imagePositionX: 60, imagePositionY: 70 }
];
const imageDate = new Date(2026, 7, 4, 9, 30);
assert.equal(tipImageDateKey(imageDate), "2026-08-04");
assert.equal(dailyTipImage([], 12, imageDate), null);
assert.deepEqual(dailyTipImage(tipImages, 12, imageDate), dailyTipImage(tipImages, 12, imageDate));
assert.ok(tipImages.includes(dailyTipImage(tipImages, 12, imageDate)!));
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
assert.equal(imageUploadResponseError(401), "Your session has expired. Sign in again, then retry the upload.");
assert.equal(
  imageUploadResponseError(502, { error: "Object Storage refused the upload (403)." }),
  "Object Storage refused the upload (403)."
);
assert.equal(
  imageUploadResponseError(413),
  "The server rejected this image because it is too large. Use an image smaller than 5 MB."
);
assert.match(imageUploadResponseError(504), /server error 504/);
assert.match(imageUploadNetworkError(new TypeError("Failed to fetch")), /could not reach/);
assert.match(objectStorageUploadError(403), /access keys/);
assert.match(objectStorageUploadError(404), /bucket name/);
assert.match(objectStorageUploadError(403, "<Error><Code>AccessDenied</Code></Error>"), /bucket permissions/);
assert.match(objectStorageUploadError(403, "<Error><Code>SignatureDoesNotMatch</Code></Error>"), /region/);
assert.match(objectStorageUploadError(404, "<Error><Code>NoSuchBucket</Code></Error>"), /does not exist/);

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
const rankedStructureMatches = rankSearchMatches(
  [
    { title: "Ring", slug: "ring", searchText: ["A ring is an algebraic structure."] },
    { title: "Structure", slug: "structure", searchText: ["A general mathematical object."] },
    { title: "Group theory", slug: "group-theory", searchText: ["The study of algebraic structures."] }
  ],
  "Structure"
);
assert.deepEqual(rankedStructureMatches.map((item) => item.title), ["Structure", "Ring", "Group theory"]);
assert.ok(
  searchMatchScore({ title: "Structure theorem", slug: "structure-theorem" }, "structure") <
    searchMatchScore({ title: "Ring", slug: "ring", searchText: ["An algebraic structure"] }, "structure")
);
assert.ok(
  searchMatchScore({ title: "Ring structure", slug: "ring-structure" }, "structure") <
    searchMatchScore({ title: "Ring", slug: "ring", searchText: ["An algebraic structure"] }, "structure")
);
const stableSearchTieBreak = rankSearchMatches(
  [
    { title: "Recent item", slug: "recent-item", searchText: ["structure"], rank: 0 },
    { title: "Older item", slug: "older-item", searchText: ["structure"], rank: 1 }
  ],
  "structure",
  undefined,
  [],
  (left, right) => left.rank - right.rank
);
assert.deepEqual(stableSearchTieBreak.map((item) => item.title), ["Recent item", "Older item"]);
assert.equal(searchMatchScore({ title: "Groupe", slug: "groupe", aliases: ["Group"] }, "group"), 1);
assert.deepEqual(searchMorphologyVariants("Rings", "en"), ["rings", "ring"]);
assert.deepEqual(searchMorphologyVariants("Finite rings", "en"), ["finite rings", "finite ring"]);
assert.deepEqual(searchMorphologyVariants("Rung", "en"), ["rung"]);
assert.deepEqual(searchMorphologyVariants("Lens", "en"), ["lens"]);
assert.deepEqual(searchMorphologyVariants("Anneaux commutatifs", "fr"), ["anneaux commutatifs", "anneau commutatif"]);
assert.deepEqual(searchDatabaseVariants("pièce", searchMorphologyVariants("pièce", "fr")), ["pièce", "piece"]);
assert.deepEqual(searchDatabaseVariants("piece", searchMorphologyVariants("piece", "fr")), ["piece"]);
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
assert.ok(
  searchMatchScore({ title: "Ring", slug: "ring" }, "Rung", searchMorphologyVariants("Rung", "en")) >
    searchMatchScore({ title: "Ring", slug: "ring" }, "Ring", searchMorphologyVariants("Ring", "en"))
);

const mathematicianFixtures = [
  {
    userId: 1,
    username: "ada",
    profileSlug: "ada",
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
    solutionCount: 1,
    explorationCount: 1,
    dailyProblemCount: 0,
    translationCount: 2
  },
  {
    userId: 2,
    username: "emmy",
    profileSlug: "emmy",
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
    solutionCount: 0,
    explorationCount: 0,
    dailyProblemCount: 1,
    translationCount: 0
  }
] satisfies UserReputationSummary[];

assert.equal(DAILY_PROBLEM_REPUTATION_POINTS, 50);
assert.equal(AUTHORED_CONCEPT_REPUTATION_POINTS, 2);
assert.equal(AUTHORED_PROBLEM_BASE_REPUTATION_POINTS, 4);
assert.equal(PROBLEM_TRANSLATION_REPUTATION_POINTS, 4);
assert.equal(authoredConceptReputationBonus(3), 6);
assert.equal(authoredConceptReputationBonus(-1), 0);
assert.equal(problemAuthorshipReputationBonus({
  favoriteCount: 0,
  trustedFavoriteCount: 0,
  solveCount: 20,
  hasIllustration: true
}), 0);
assert.equal(problemAuthorshipReputationBonus({
  favoriteCount: 1,
  trustedFavoriteCount: 0,
  solveCount: 2,
  hasIllustration: false
}), 8);
assert.equal(problemAuthorshipReputationBonus({
  favoriteCount: 3,
  trustedFavoriteCount: 1,
  solveCount: 14,
  hasIllustration: true
}), 23);
assert.equal(solutionAuthorshipReputationBonus({ usefulVoteCount: 2, hasIllustration: true }), 0);
assert.equal(solutionAuthorshipReputationBonus({ usefulVoteCount: 3, hasIllustration: false }), 8);
assert.equal(solutionAuthorshipReputationBonus({ usefulVoteCount: 5, hasIllustration: true }), 14);
assert.equal(solutionAuthorshipReputationBonus({ usefulVoteCount: 100, hasIllustration: true }), 30);
assert.equal(reviewedContributionReputationBonus(101), 100);
assert.equal(curationActivityReputationBonus(4), 0);
assert.equal(curationActivityReputationBonus(5), 1);
assert.equal(curationActivityReputationBonus(500), 20);
assert.equal(contentHasIllustration("A diagram: ![triangle](/uploads/triangle.png)"), true);
assert.equal(contentHasIllustration("```jsxgraph\nconst board = JXG.JSXGraph.initBoard('box');\n```"), true);
assert.equal(contentHasIllustration("Only text and $x^2$."), false);
assert.equal(dailyProblemReputationBonus(3, Role.USER), 150);
assert.equal(dailyProblemReputationBonus(3, Role.MODERATOR), 150);
assert.equal(dailyProblemReputationBonus(3, Role.ADMIN), 0);
assert.equal(dailyProblemReputationBonus(3, Role.OWNER), 0);
assert.equal(dailyProblemReputationBonus(-2, Role.USER), 0);

const reputationDate = (day: number, hour = 0) => new Date(Date.UTC(2026, 0, day, hour));
assert.equal(learningSolveReputationBonus([
  { translationGroupId: "problem-a", solvedAt: reputationDate(1) },
  { translationGroupId: "problem-a", solvedAt: reputationDate(1, 1) },
  { translationGroupId: "problem-b", solvedAt: reputationDate(1, 2) },
  { translationGroupId: "problem-c", solvedAt: reputationDate(1, 3) },
  { translationGroupId: "problem-d", solvedAt: reputationDate(1, 4) },
  { translationGroupId: "problem-e", solvedAt: reputationDate(1, 5) },
  { translationGroupId: "problem-f", solvedAt: reputationDate(1, 6) },
  { translationGroupId: "problem-g", solvedAt: reputationDate(2) }
]), 6);
assert.equal(learningSolveReputationBonus(Array.from({ length: 60 }, (_, index) => ({
  translationGroupId: `problem-${index}`,
  solvedAt: reputationDate(1 + Math.floor(index / 5), index % 5)
}))), 50);

assert.equal(translationReputationBonus([
  { key: "problem:1", createdAt: reputationDate(1), points: PROBLEM_TRANSLATION_REPUTATION_POINTS },
  { key: "problem:1", createdAt: reputationDate(1, 1), points: PROBLEM_TRANSLATION_REPUTATION_POINTS },
  { key: "concept:2", createdAt: reputationDate(1, 2), points: 2 },
  { key: "hint:3", createdAt: reputationDate(1, 3), points: 1 },
  { key: "proof:4", createdAt: reputationDate(1, 4), points: 1 }
]), 8);
assert.equal(translationReputationBonus(Array.from({ length: 7 }, (_, index) => ({
  key: `problem:${index}`,
  createdAt: reputationDate(1, index),
  points: 2
}))), 14);

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
assert.equal(normalizeConceptShareMessage("  Read this!  "), "Read this!");
assert.equal(
  normalizeConceptShareMessage("x".repeat(CONCEPT_SHARE_MESSAGE_MAX_LENGTH + 20)).length,
  CONCEPT_SHARE_MESSAGE_MAX_LENGTH
);
assert.equal(
  conceptShareNotificationBody({
    senderName: "Emmy",
    conceptTitle: "Compact [space]",
    message: "This may help."
  }),
  'Emmy shared the concept "Compact [space]" with you. This may help.'
);
assert.equal(
  conceptShareChatMarkdown({
    conceptTitle: "Compact [space]",
    conceptSlug: "compact-space",
    message: "This may help."
  }),
  "**Shared concept**\n\n[Compact \\[space\\]](/concepts/compact-space)\n\nThis may help."
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

const reverseTranslatedHints = [
  {
    id: 10,
    translationGroupId: "source-first",
    translatedFromHintId: null,
    problemId: 30,
    proofId: null,
    position: 0,
    bodyMarkdown: "First source hint",
    bodyHtml: "<p>First source hint</p>",
    language: "en",
    translatedFromProblemId: null
  },
  {
    id: 11,
    translationGroupId: "source-second",
    translatedFromHintId: null,
    problemId: 30,
    proofId: null,
    position: 0,
    bodyMarkdown: "Second source hint",
    bodyHtml: "<p>Second source hint</p>",
    language: "en",
    translatedFromProblemId: null
  },
  {
    id: 12,
    translationGroupId: "source-second",
    translatedFromHintId: 11,
    problemId: 40,
    proofId: null,
    position: 0,
    bodyMarkdown: "Deuxieme indice traduit en premier",
    bodyHtml: "<p>Deuxieme indice traduit en premier</p>",
    language: "fr",
    translatedFromProblemId: 30
  },
  {
    id: 13,
    translationGroupId: "source-first",
    translatedFromHintId: 10,
    problemId: 40,
    proofId: null,
    position: 99,
    bodyMarkdown: "Premier indice traduit ensuite",
    bodyHtml: "<p>Premier indice traduit ensuite</p>",
    language: "fr",
    translatedFromProblemId: 30
  }
];
assert.deepEqual(
  selectProblemHintsForLanguage(reverseTranslatedHints, 40).map((hint) => hint.id),
  [13, 12],
  "hint translation order must follow the source lineage, not local creation ids"
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
assert.equal(recommendationProfile.declaredDifficulty, 38);
assert.ok(recommendationProfile.targetDifficulty > 38 && recommendationProfile.targetDifficulty < 50);
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

const knownProblemDismissalProfile = buildRecommendationProfile(
  {
    mathLevel: "UNDERGRAD",
    mathematicalDomains: ["ALGEBRA"],
    attempts: [],
    favorites: [],
    dismissals: [{
      difficulty: 35,
      domains: ["ALGEBRA"],
      reason: "ALREADY_KNOWN",
      updatedAt: recommendationNow
    }]
  },
  recommendationNow
);
const uninterestedDomainProfile = buildRecommendationProfile(
  {
    mathLevel: "UNDERGRAD",
    mathematicalDomains: ["ALGEBRA"],
    attempts: [],
    favorites: [],
    dismissals: [{
      difficulty: 35,
      domains: ["ALGEBRA"],
      reason: "NOT_INTERESTED_IN_DOMAIN",
      updatedAt: recommendationNow
    }]
  },
  recommendationNow
);
assert.equal(knownProblemDismissalProfile.domains.ALGEBRA.affinity, 0.35);
assert.ok(uninterestedDomainProfile.domains.ALGEBRA.affinity < knownProblemDismissalProfile.domains.ALGEBRA.affinity);
assert.equal(uninterestedDomainProfile.modelVersion, 6);

const fittingRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 1,
    translationGroupId: "candidate",
    difficulty: 42,
    isConjecture: false,
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
    difficulty: 85,
    isConjecture: false,
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
assert.equal(RECOMMENDATION_DIFFICULTY_CEILING, 90);
assert.equal(isProblemRecommendationEligible({ difficulty: 89, isConjecture: false }), true);
assert.equal(isProblemRecommendationEligible({ difficulty: 90, isConjecture: false }), false);
assert.equal(isProblemRecommendationEligible({ difficulty: null, isConjecture: false }), false);
assert.equal(isProblemRecommendationEligible({ difficulty: 42, isConjecture: true }), false);
assert.equal(
  scoreProblemRecommendation(
    recommendationProfile,
    {
      id: 9,
      translationGroupId: "research-level",
      difficulty: 90,
      isConjecture: false,
      domains: ["ALGEBRA"],
      qualityStatus: "REVIEWED",
      isExercise: false,
      createdAt: recommendationNow
    },
    { mathLevel: "UNDERGRAD", now: recommendationNow }
  ),
  null
);
assert.equal(
  scoreProblemRecommendation(
    recommendationProfile,
    {
      id: 10,
      translationGroupId: "conjecture",
      difficulty: 42,
      isConjecture: true,
      domains: ["ALGEBRA"],
      qualityStatus: "REVIEWED",
      isExercise: false,
      createdAt: recommendationNow
    },
    { mathLevel: "UNDERGRAD", now: recommendationNow }
  ),
  null
);
assert.equal(
  scoreProblemRecommendation(
    recommendationProfile,
    {
      id: 3,
      translationGroupId: "already-solved",
      difficulty: 35,
      isConjecture: false,
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
    isConjecture: false,
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

const freshStartedRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 5,
    translationGroupId: "fresh-started",
    difficulty: 42,
    isConjecture: false,
    domains: ["ALGEBRA"],
    qualityStatus: "REVIEWED",
    isExercise: false,
    createdAt: recommendationNow,
    attemptStatus: "STARTED",
    attemptUpdatedAt: new Date("2026-07-31T12:00:00.000Z")
  },
  { mathLevel: "UNDERGRAD", now: recommendationNow }
);
const staleStartedRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 6,
    translationGroupId: "stale-started",
    difficulty: 42,
    isConjecture: false,
    domains: ["ALGEBRA"],
    qualityStatus: "REVIEWED",
    isExercise: false,
    createdAt: recommendationNow,
    attemptStatus: "STARTED",
    attemptUpdatedAt: new Date("2026-07-20T12:00:00.000Z")
  },
  { mathLevel: "UNDERGRAD", now: recommendationNow }
);
assert.ok(freshStartedRecommendation && staleStartedRecommendation);
assert.ok(freshStartedRecommendation.score > staleStartedRecommendation.score);
assert.equal(staleStartedRecommendation.parts.find((part) => part.code === "resume")?.points, -10);

const fatiguedRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 7,
    translationGroupId: "repeatedly-opened",
    difficulty: 42,
    isConjecture: false,
    domains: ["ALGEBRA"],
    qualityStatus: "REVIEWED",
    isExercise: false,
    createdAt: recommendationNow,
    exposureCount: 5,
    lastOpenedAt: recommendationNow
  },
  { mathLevel: "UNDERGRAD", now: recommendationNow }
);
const restedRecommendation = scoreProblemRecommendation(
  recommendationProfile,
  {
    id: 8,
    translationGroupId: "rested-after-openings",
    difficulty: 42,
    isConjecture: false,
    domains: ["ALGEBRA"],
    qualityStatus: "REVIEWED",
    isExercise: false,
    createdAt: recommendationNow,
    exposureCount: 5,
    lastOpenedAt: new Date("2026-05-01T12:00:00.000Z")
  },
  { mathLevel: "UNDERGRAD", now: recommendationNow }
);
assert.ok(fatiguedRecommendation && restedRecommendation);
assert.ok(restedRecommendation.score > fatiguedRecommendation.score);
assert.equal(fatiguedRecommendation.parts.find((part) => part.code === "exposure_fatigue")?.points, -24);

assert.deepEqual(
  recommendationDifficultyAdjustment(42, [], "2026-08-02"),
  {
    offset: 0,
    adjustedTargetDifficulty: 42,
    qualifiedDays: 0,
    consecutiveUnsolvedDays: 0,
    reason: "none"
  },
  "logging in without opening a recommendation must not lower difficulty"
);
assert.equal(
  recommendationDifficultyAdjustment(
    42,
    [{ eventType: "OPENED", dateKey: "2026-08-01" }],
    "2026-08-02"
  ).offset,
  -5
);
assert.equal(
  recommendationDifficultyAdjustment(
    42,
    [
      { eventType: "OPENED", dateKey: "2026-08-01" },
      { eventType: "STARTED", dateKey: "2026-08-01" }
    ],
    "2026-08-02"
  ).offset,
  -7
);
assert.equal(
  recommendationDifficultyAdjustment(
    42,
    [
      { eventType: "OPENED", dateKey: "2026-08-01" },
      { eventType: "TOO_HARD", dateKey: "2026-08-01" },
      { eventType: "OPENED", dateKey: "2026-08-02" },
      { eventType: "TOO_HARD", dateKey: "2026-08-02" }
    ],
    "2026-08-03"
  ).offset,
  -15,
  "consecutive difficult days must respect the -15 cap"
);
assert.equal(
  recommendationDifficultyAdjustment(
    42,
    [
      { eventType: "OPENED", dateKey: "2026-08-01" },
      { eventType: "SOLVED", dateKey: "2026-08-02" }
    ],
    "2026-08-03"
  ).offset,
  0,
  "a solve must recover five points toward the permanent target"
);
assert.equal(
  recommendationDifficultyAdjustment(
    42,
    [{ eventType: "OPENED", dateKey: "2026-08-01" }],
    "2026-08-15"
  ).offset,
  0,
  "temporary difficulty adaptation must decay after inactivity"
);

const selectionCandidates = [
  { problem: { id: 1, difficulty: 44, domains: ["ALGEBRA"] }, score: 100, confidence: 0.9, attemptStatus: "STARTED" as const },
  { problem: { id: 2, difficulty: 42, domains: ["ALGEBRA"] }, score: 95, confidence: 0.9 },
  { problem: { id: 3, difficulty: 25, domains: ["ALGEBRA"] }, score: 70, confidence: 0.8 },
  { problem: { id: 4, difficulty: 40, domains: ["TOPOLOGY"] }, score: 65, confidence: 0.7 },
  { problem: { id: 5, difficulty: 43, domains: ["ALGEBRA"] }, score: 60, confidence: 0.8 }
];
const composedRecommendations = composeProblemRecommendations(
  selectionCandidates,
  4,
  42,
  recommendationProfile.domains
);
assert.equal(composedRecommendations[0]?.selectionReason, "continue");
assert.ok(composedRecommendations.some((item) => item.selectionReason === "confidence" && item.problem.id === 3));
assert.ok(composedRecommendations.some((item) => item.selectionReason === "explore" && item.problem.id === 4));
assert.equal(new Set(composedRecommendations.map((item) => item.problem.id)).size, composedRecommendations.length);
assert.deepEqual(
  excludedRecommendationGroupIds(
    ["solved", "shared"],
    ["authored", "shared", "authored"],
    ["dismissed", "shared"]
  ),
  ["solved", "shared", "authored", "dismissed"]
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
    { translationGroupId: "already-featured" },
    { translationGroupId: "not-featured" }
  ], "2026-08-03", ["already-featured"]),
  "not-featured"
);
const exhaustedDailyProblemChoice = automaticDailyProblemGroup(
  [{ translationGroupId: "first" }, { translationGroupId: "second" }],
  "2026-08-03",
  ["first", "second"]
);
assert.ok(exhaustedDailyProblemChoice === "first" || exhaustedDailyProblemChoice === "second");
assert.equal(
  automaticDailyProblemGroup(
    [{ translationGroupId: "first" }, { translationGroupId: "second" }],
    "2026-08-03",
    ["first", "second"]
  ),
  exhaustedDailyProblemChoice
);
assert.equal(automaticDailyProblemGroup([], "2026-08-03"), null);

assert.equal(isSaturdayDateKey("2026-08-15"), true);
assert.equal(isSaturdayDateKey("2026-08-16"), false);
assert.equal(contestEndDateKey("2026-08-15"), "2026-08-21");
assert.equal(nextContestStartDateKey(new Date("2026-08-14T12:00:00.000Z")), "2026-08-15");
assert.equal(nextContestStartDateKey(new Date("2026-08-15T12:00:00.000Z")), "2026-08-15");
const contestFixture = {
  publishedAt: new Date("2026-08-14T12:00:00.000Z"),
  resultsPublishedAt: null,
  startDateKey: "2026-08-15",
  endDateKey: "2026-08-21"
};
assert.equal(contestPhase(contestFixture, "2026-08-14"), "upcoming");
assert.equal(contestPhase(contestFixture, "2026-08-15"), "open");
assert.equal(contestPhase(contestFixture, "2026-08-21"), "open");
assert.equal(contestPhase(contestFixture, "2026-08-22"), "judging");
assert.equal(contestIsOpen(contestFixture, "2026-08-18"), true);
const summerContestWindow = contestCreationWindow(contestFixture);
assert.equal(summerContestWindow.gte.toISOString(), "2026-08-14T22:00:00.000Z");
assert.equal(summerContestWindow.lt.toISOString(), "2026-08-21T22:00:00.000Z");
assert.ok(DEFAULT_DAILY_PROBLEM_IMAGE_URLS.includes(dailyProblemDefaultImageUrl("2026-08-03")));

const scheduledDailyTipCandidates = [
  { id: 1, showInMainMenu: true, title: "First" },
  { id: 2, showInMainMenu: false, title: "Scheduled only" },
  { id: 3, showInMainMenu: true, title: "Third" }
];
assert.equal(
  selectDailyTipForDate(scheduledDailyTipCandidates, "2026-08-03", 2)?.title,
  "Scheduled only"
);
assert.equal(
  selectDailyTipForDate(scheduledDailyTipCandidates, "2026-08-03", null, 1)?.title,
  "First"
);
assert.equal(
  selectDailyTipForDate(scheduledDailyTipCandidates, "2026-08-03", 2, 1)?.title,
  "Scheduled only"
);
assert.equal(
  selectDailyTipForDate(
    scheduledDailyTipCandidates.map((tip) => ({ ...tip, showInMainMenu: false })),
    "2026-08-03",
    null,
    3
  )?.title,
  "Third"
);
assert.equal(
  selectDailyTipForDate(scheduledDailyTipCandidates, "2026-08-03")?.showInMainMenu,
  true
);
assert.equal(selectDailyTipForDate([], "2026-08-03"), null);
assert.equal(
  selectDailyTipForDate([{ id: 1, showInMainMenu: false }], "2026-08-03"),
  null
);

assert.equal(
  parseSolutionReportCategory(ReportCategory.MATHEMATICAL_ERROR),
  ReportCategory.MATHEMATICAL_ERROR
);
assert.throws(() => parseSolutionReportCategory("DOWNVOTE"), /valid solution report reason/);
assert.equal(solutionReportCategoryLabel(ReportCategory.INCOMPLETE_ARGUMENT), "incomplete argument");
assert.equal(solutionConcernIsPublic([Role.USER]), false);
assert.equal(solutionConcernIsPublic([Role.USER, Role.USER]), true);
assert.equal(solutionConcernIsPublic([Role.MODERATOR]), true);

assert.equal(dailyConceptReviewStatusRank(ConceptStatus.MISSING), 0);
assert.equal(dailyConceptReviewStatusRank(ConceptStatus.STUB), 1);
assert.equal(dailyConceptReviewStatusRank(ConceptStatus.USABLE), 2);
assert.equal(isDailyConceptReviewStatus(ConceptStatus.REVIEWED), false);
const staleConceptCandidates = Array.from({ length: DAILY_CONCEPT_REVIEW_STALE_POOL_SIZE + 2 }, (_, index) => ({
  id: index + 1,
  updatedAt: new Date(Date.UTC(2026, 0, index + 1))
}));
assert.equal(pickStaleConceptCandidate(staleConceptCandidates, () => 0)?.id, 1);
assert.equal(
  pickStaleConceptCandidate(staleConceptCandidates, () => 0.999)?.id,
  DAILY_CONCEPT_REVIEW_STALE_POOL_SIZE
);
assert.equal(pickStaleConceptCandidate([], () => 0), null);
assert.deepEqual(dailyReminderWindow(new Date("2026-08-04T08:00:00.000Z")), {
  start: new Date("2026-08-03T22:00:00.000Z"),
  end: new Date("2026-08-04T22:00:00.000Z")
});
assert.deepEqual(dailyReminderWindow(new Date("2026-01-04T08:00:00.000Z")), {
  start: new Date("2026-01-03T23:00:00.000Z"),
  end: new Date("2026-01-04T23:00:00.000Z")
});

assert.equal(pickRandomDifferent([], undefined, () => 0), undefined);
assert.equal(pickRandomDifferent(["only"], "only", () => 0), "only");
assert.equal(pickRandomDifferent(["first", "second", "third"], "first", () => 0), "second");
assert.equal(pickRandomDifferent(["first", "second", "third"], "second", () => 0.99), "third");

const browserProblemTranslations = [
  { id: 1, language: "fr", translatedFromProblemId: null },
  { id: 2, language: "en", translatedFromProblemId: 1 }
];
assert.equal(selectProblemBrowserTranslation(browserProblemTranslations, "en", ["fr", "en"])?.id, 2);
assert.equal(selectProblemBrowserTranslation(browserProblemTranslations, "fr", ["en", "fr"])?.id, 1);
assert.equal(selectProblemBrowserTranslation(browserProblemTranslations.slice(0, 1), "en", ["fr"])?.id, 1);

assert.equal(hasExamplesSection("## Examples\n\n- A square."), true);
assert.equal(hasExamplesSection("### Exemple\n\nUn carré."), true);
assert.equal(hasExamplesSection("An example appears in this sentence."), false);
assert.equal(hasExamplesSection("## Counterexamples\n\nNone yet."), false);
assert.equal(parseContributionTaskKey("stub-concepts"), "stub-concepts");
assert.equal(parseContributionTaskKey("exercises-without-concepts"), "exercises-without-concepts");
assert.equal(parseContributionTaskKey("unknown-task"), null);
assert.equal(parseProblemTranslationTaskKey("problems-missing-fr"), "problems-missing-fr");
assert.equal(parseProblemTranslationTaskKey("concepts-missing-fr"), null);
assert.equal(problemTranslationTaskTargetLanguage("problems-missing-fr"), "fr");
assert.equal(problemTranslationTaskTargetLanguage("problems-missing-en"), "en");
const contributionTranslationPages = [
  { language: "en", slug: "groups", translationGroupId: "group-a" },
  { language: "fr", slug: "groupes", translationGroupId: "group-a" },
  { language: "en", slug: "rings", translationGroupId: "group-b" },
  { language: "fr", slug: "corps", translationGroupId: "group-c" }
];
assert.equal(translationGroupCount(contributionTranslationPages), 3);
assert.deepEqual(
  translationSourcesMissingLanguage(contributionTranslationPages, "fr").map((page) => page.slug),
  ["rings"]
);
assert.deepEqual(
  translationSourcesMissingLanguage(contributionTranslationPages, "en").map((page) => page.slug),
  ["corps"]
);
assert.equal(parseObservabilityRange("24h"), "24h");
assert.equal(parseObservabilityRange("7d"), "7d");
assert.equal(parseObservabilityRange("forever"), "24h");
assert.equal(normalizedObservabilityRoute("/problems/la-piece-manquante"), "/problems/[slug]");
assert.equal(
  normalizedObservabilityRoute("/problems/example/proofs/42/discussion?from=menu"),
  "/problems/[slug]/proofs/[proofId]/discussion"
);
assert.equal(normalizedObservabilityRoute("/profile/real-person-name"), "/profile/[username]");
assert.equal(normalizedObservabilityRoute("/concepts/norm/edit"), "/concepts/[slug]/edit");
assert.equal(normalizedObservabilityRoute("/problems"), "/problems");
assert.equal(normalizedObservabilityRoute("/problems/new"), "/problems/new");
assert.equal(normalizedObservabilityRoute("/untrusted-arbitrary-value"), "/other");

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
const historicalSolvedAt = new Date("2026-07-14T08:30:00.000Z");
assert.equal(
  problemSolvedAt([
    {
      solvedAt: historicalSolvedAt,
      status: "SOLVED",
      updatedAt: new Date("2026-08-12T10:00:00.000Z")
    }
  ])?.toISOString(),
  historicalSolvedAt.toISOString()
);
assert.equal(
  problemSolvedAt([
    {
      solvedAt: null,
      status: "SOLVED",
      updatedAt: historicalSolvedAt
    }
  ])?.toISOString(),
  historicalSolvedAt.toISOString()
);
assert.equal(formatProblemSolvedDate(new Date("2026-07-14T12:00:00.000Z"), "en"), "Jul 14, 2026");
assert.equal(
  shouldShowOwnerSolvedBanner({
    hasAnyProof: false,
    hasOwnProof: false,
    hasRelatedProblems: false,
    isExercise: false
  }),
  true
);
assert.equal(
  shouldShowOwnerSolvedBanner({
    hasAnyProof: true,
    hasOwnProof: false,
    hasRelatedProblems: false,
    isExercise: false
  }),
  false
);
assert.equal(
  shouldShowOwnerSolvedBanner({
    hasAnyProof: true,
    hasOwnProof: true,
    hasRelatedProblems: true,
    isExercise: false
  }),
  false
);
assert.equal(
  shouldShowOwnerSolvedBanner({
    hasAnyProof: true,
    hasOwnProof: true,
    hasRelatedProblems: true,
    isExercise: true
  }),
  true
);
assert.equal(isUnknownProblemOrigin(" Unknown "), true);
assert.equal(isUnknownProblemOrigin("Inconnue"), true);
assert.equal(isUnknownProblemOrigin("A classical textbook"), false);
assert.equal(normalizeProblemOrigin("Inconnue"), "Unknown");
assert.equal(normalizeProblemOrigin("  Euclid, Elements  "), "Euclid, Elements");
assert.equal(localizedProblemOrigin("Unknown", "Inconnue"), "Inconnue");
assert.equal(localizedProblemOrigin("Euler's correspondence", "Inconnue"), "Euler's correspondence");
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

assert.deepEqual(
  problemTranslationSharedChanges([
    "title",
    "bodyMarkdown",
    "difficulty",
    "domains",
    "knownSourceId",
    "qualityStatus",
    "verificationPrompt",
    "relatedProblemGroups"
  ]),
  ["difficulty", "domains", "knownSourceId"]
);
assert.deepEqual(
  conceptTranslationSharedChanges([
    "title",
    "bodyMarkdown",
    "domainCode",
    "status",
    "aliases",
    "references",
    "practiceExercises"
  ]),
  ["domainCode", "practiceExercises"]
);

assert.equal(
  latestTranslationTextRevisionId([
    { id: 1, markdown: "First text", title: "First title" },
    { id: 2, markdown: "First text", title: "First title" },
    { id: 3, markdown: "Second text", title: "First title" },
    { id: 4, markdown: "Second text", title: "First title" },
    { id: 5, markdown: "Second text", title: "Second title" },
    { id: 6, markdown: "Second text", title: "Second title" }
  ]),
  5
);
assert.equal(
  latestTranslationTextRevisionId([
    { id: 1, markdown: "Text", title: null },
    { id: 2, markdown: "Text", title: "Backfilled title" }
  ]),
  1
);
assert.equal(revisionSnapshotTitle({ schemaVersion: 1, title: "A title" }), "A title");
assert.equal(revisionSnapshotTitle({ schemaVersion: 1, title: 42 }), null);

assert.equal(isSitePresenceId("65b34742-92dc-4ec0-a928-216063f96a30"), true);
assert.equal(isSitePresenceId("not-a-presence-id"), false);
assert.equal(sitePresenceIsActive(100_001, 190_000), true);
assert.equal(sitePresenceIsActive(100_000, 190_000), false);

const menuFriends = [
  { lastSeenAt: "2026-08-10T10:00:00.000Z", name: "Zo\u00e9", online: false, unreadCount: 1, username: "zoe" },
  { lastSeenAt: "2026-08-12T10:00:00.000Z", name: "Alice", online: true, unreadCount: 0, username: "alice" },
  { lastSeenAt: "2026-08-11T10:00:00.000Z", name: "Bernard", online: false, unreadCount: 0, username: "bernard" }
];
assert.deepEqual(
  friendsForMenu(menuFriends, { showOffline: false, sort: "recent" }, "fr").map((friend) => friend.username),
  ["alice", "zoe"]
);
assert.deepEqual(
  friendsForMenu(menuFriends, { showOffline: true, sort: "alphabetical" }, "fr").map((friend) => friend.username),
  ["alice", "bernard", "zoe"]
);
assert.deepEqual(parseFriendsMenuPreferences("not-json"), { showOffline: true, sort: "recent" });

const translatedTip = [
  { language: "en", title: "Try a smaller case", body: "Reduce the problem first." },
  { language: "fr", title: "Essayez un cas plus simple", body: "Réduisez d'abord le problème." }
];
assert.equal(selectTipTranslation(translatedTip, "fr", translatedTip[0]).title, "Essayez un cas plus simple");
assert.equal(selectTipTranslation(translatedTip.slice(0, 1), "fr", translatedTip[0]).language, "en");
const persistedTipTranslations = [
  { id: 37, language: "fr", title: "Titre traduit", body: "Texte traduit" }
];
assert.deepEqual(
  selectTipTranslation(
    persistedTipTranslations,
    "fr",
    translatedTip[0]
  ),
  { language: "fr", title: "Titre traduit", body: "Texte traduit" }
);

const selectedTipProblems = selectTipProblemTranslations(
  [
    { translationGroupId: "group-a" },
    { translationGroupId: "group-b" }
  ],
  [
    { id: 1, language: "en", translationGroupId: "group-a", translatedFromProblemId: null },
    { id: 2, language: "fr", translationGroupId: "group-a", translatedFromProblemId: 1 },
    { id: 3, language: "en", translationGroupId: "group-b", translatedFromProblemId: null }
  ],
  "fr"
);
assert.deepEqual(selectedTipProblems.map((problem) => problem.id), [2, 3]);

assert.equal(
  translationLinkOverrideRequested({
    get: (name) => name === TRANSLATION_LINK_OVERRIDE_FIELD ? "confirm" : null
  }),
  true
);
assert.equal(
  translationLinkOverrideRequested({ get: () => "on" }),
  false
);
assert.equal(normalizeTranslationTitle("  Fundamental   Group  "), "fundamental group");
assert.equal(translationTitlesMatch("K-theory", "  K-THEORY "), true);
assert.equal(translationTitlesMatch("Group", "Groupe"), false);
assert.throws(
  () => assertTranslationTitleChanged("Euler characteristic", "Euler characteristic", false),
  SameTranslationTitleError
);
assert.doesNotThrow(() =>
  assertTranslationTitleChanged("Euler characteristic", "Euler characteristic", true)
);
assert.equal(
  sameTranslationTitleOverrideRequested({
    get: (name) => name === SAME_TRANSLATION_TITLE_OVERRIDE_FIELD ? "confirm" : null
  }),
  true
);
assert.equal(sameTranslationTitleOverrideRequested({ get: () => "on" }), false);
assert.equal(formatCompactNumber(999), "999");
assert.equal(formatCompactNumber(1_000), "1k");
assert.equal(formatCompactNumber(1_250), "1.3k");
assert.equal(formatCompactNumber(12_500), "12.5k");
assert.equal(formatCompactNumber(999_999), "1M");
assert.equal(formatCompactNumber(1_250_000), "1.3M");
assert.equal(parseUserDiscoverySource("three_blue_one_brown"), "THREE_BLUE_ONE_BROWN");
assert.equal(parseUserDiscoverySource("PHIL"), "PHIL");
assert.equal(parseUserDiscoverySource("unknown-source"), null);
assert.equal(parseUserDiscoverySource(null), null);

const creationKey = creationSubmissionKey("concept", 7, "12345678-draft");
assert.equal(creationKey?.length, 64);
assert.equal(creationSubmissionKey("concept", 7, "12345678-draft"), creationKey);
assert.notEqual(creationSubmissionKey("concept", 8, "12345678-draft"), creationKey);
assert.equal(creationSubmissionKey("concept", 7, "short"), null);

const onceRateLimitKey = `core-test-once-${Date.now()}`;
await assertRateLimitOnce(onceRateLimitKey, "same-submission", 1, 5_000);
await assertRateLimitOnce(onceRateLimitKey, "same-submission", 1, 5_000);
await assert.rejects(
  assertRateLimitOnce(onceRateLimitKey, "another-submission", 1, 5_000),
  RateLimitError
);

console.log("core tests ok");
