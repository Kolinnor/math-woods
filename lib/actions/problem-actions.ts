"use server";

import type { Route } from "next";
import {
  AttemptStatus,
  NotificationType,
  PostType,
  ProblemStatus,
  ProblemVerificationMode,
  Prisma,
  QualityStatus,
  MathDomain,
  SourceType,
  TargetType,
  VoteType
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  checkHintAchievements,
  checkProblemSolvedByOthersAchievements,
  checkSolveAchievements,
  checkUsefulPostAchievements
} from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { unlockDate } from "@/lib/attempts";
import { prisma } from "@/lib/db";
import { boundedText, CONTENT_LIMITS, optionalBoundedText, requiredBoundedText } from "@/lib/content-limits";
import { assertDailyContentCreationQuota } from "@/lib/content-creation-quota";
import {
  assertTranslationWikiLinksPreserved,
  syncInternalLinks,
  TranslationWikiLinksPreservedError
} from "@/lib/internal-links";
import { canEditExploration } from "@/lib/explorations";
import {
  createNotification,
  notifyAdminsOfProblemEditProposal,
  notifyOwnerOfSiteActivity,
  notifyProblemAuthor,
  notifyProblemEditSubscribers
} from "@/lib/notifications";
import {
  editableContentLanguage,
  parseTranslationGroupId,
  requireActiveContentLanguage
} from "@/lib/languages";
import { problemCreationNotificationCopy } from "@/lib/problem-creation-notifications";
import { parseProblemDomains, syncProblemDomains } from "@/lib/problem-domains";
import { normalizeProblemOrigin } from "@/lib/problem-origin";
import { linkSpecificProblem, parseProblemRelationGroups, syncProblemRelationGroups } from "@/lib/problem-relations";
import {
  PROBLEM_SNAPSHOT_FIELD_LABELS,
  buildProblemRevisionSnapshot,
  changedProblemSnapshotFields,
  mergeProblemRevisionSnapshots,
  parseProblemRevisionSnapshot,
  problemRevisionSnapshotJson,
  problemSnapshotRelationInput,
  problemSnapshotTagInput,
  type ProblemRevisionSnapshot
} from "@/lib/problem-revisions";
import {
  parseProblemVerificationMode,
  verificationMatches
} from "@/lib/problem-verification";
import { parseProblemDifficulty } from "@/lib/problems";
import { parseProblemStyles } from "@/lib/problem-styles";
import {
  hasProblemReviewSensitiveChanges,
  needsReviewAfterProblemEdit
} from "@/lib/problem-review-state";
import { parseContributorQualityStatus } from "@/lib/quality";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  canArchiveProblem,
  canEditDiscussionHint,
  canEditVerificationMessage,
  canEditProblem,
  canProposeProblemEdit,
  canJoinVerificationDiscussion,
  canReviewProblemVerification,
  canReviewProblem,
  canRollbackProblem,
  canSetProblemQualityStatus,
  canUseAdminTools
} from "@/lib/permissions";
import { canPublishProblemEditForProblem } from "@/lib/problem-edit-access";
import { contestIsOpen } from "@/lib/problem-contests";
import { ensureSlug } from "@/lib/slug";
import { syncProblemSpoilerTags, syncProblemTags } from "@/lib/tags";
import { contentLanguageViewHref } from "@/lib/translation-routing";
import { translationLinkOverrideRequested } from "@/lib/translation-link-warning";
import { problemTranslationSharedChanges } from "@/lib/translation-properties";
import {
  assertTranslationTitleChanged,
  sameTranslationTitleOverrideRequested,
  SameTranslationTitleError
} from "@/lib/translation-title-guard";
import { latestProblemTextRevisionIdFromRevisions } from "@/lib/translation-text-revisions";
import { uniqueSlug } from "@/lib/unique-slug";
import { displayNameForUser } from "@/lib/user-display";
import {
  parseSelectedTranslationIds,
  TRANSLATED_HINT_BODY_PREFIX,
  TRANSLATED_PROOF_BODY_PREFIX,
  TRANSLATED_PROOF_HINT_BODY_PREFIX,
  translationBodyFieldName
} from "@/lib/translation-companions";
import { acquireTransactionLock } from "@/lib/transaction-lock";

export type ProblemEditActionState =
  | { status: "idle" }
  | {
      status: "conflict";
      currentVersion: number;
      editorName: string | null;
      editedAt: string | null;
      conflictingFields: string[];
    };

class ProblemEditConflictError extends Error {
  constructor(
    readonly currentVersion: number,
    readonly conflictingFields: string[] = []
  ) {
    super("This problem changed while you were editing it.");
  }
}

const problemRevisionSnapshotInclude = {
  domains: { orderBy: { position: "asc" as const } },
  tags: { include: { tag: { select: { name: true, slug: true } } } },
  spoilerTags: { include: { tag: { select: { name: true, slug: true } } } },
  relatedGroups: {
    orderBy: { position: "asc" as const },
    include: {
      relations: {
        orderBy: { position: "asc" as const },
        include: { targetProblem: { select: { slug: true } } }
      }
    }
  }
} satisfies Prisma.ProblemInclude;

async function problemSnapshotSource(tx: Prisma.TransactionClient, problemId: number) {
  const problem = await tx.problem.findUnique({
    where: { id: problemId },
    include: problemRevisionSnapshotInclude
  });
  if (!problem) throw new Error("Problem not found.");
  return problem;
}

async function ensureProblemSnapshotRevision(
  tx: Prisma.TransactionClient,
  problem: Awaited<ReturnType<typeof problemSnapshotSource>>
) {
  const snapshot = buildProblemRevisionSnapshot(problem);
  const matchingRevision = await tx.pageRevision.findFirst({
    where: {
      pageType: SourceType.PROBLEM,
      pageId: problem.id,
      problemVersion: problem.version
    },
    orderBy: { id: "desc" }
  });
  if (matchingRevision?.problemSnapshot) return;

  const latestRevision = await tx.pageRevision.findFirst({
    where: { pageType: SourceType.PROBLEM, pageId: problem.id },
    orderBy: { id: "desc" }
  });
  if (problem.version === 1 && latestRevision && latestRevision.problemVersion === null) {
    await tx.pageRevision.update({
      where: { id: latestRevision.id },
      data: {
        problemVersion: problem.version,
        problemSnapshot: problemRevisionSnapshotJson(snapshot)
      }
    });
    return;
  }

  await tx.pageRevision.create({
    data: {
      pageType: SourceType.PROBLEM,
      pageId: problem.id,
      markdown: problem.bodyMarkdown,
      problemVersion: problem.version,
      problemSnapshot: problemRevisionSnapshotJson(snapshot),
      editSummary: "Problem state captured"
    }
  });
}

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

function intField(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function mergedAttemptStatus(left: AttemptStatus, right: AttemptStatus) {
  const rank: Record<AttemptStatus, number> = {
    STARTED: 0,
    BLOCKED: 1,
    REVIEW_LATER: 2,
    SOLVED: 3
  };
  return rank[right] > rank[left] ? right : left;
}

function problemEditNotificationBody({
  actorName,
  title,
  changedFields,
  editSummary
}: {
  actorName: string;
  title: string;
  changedFields: string[];
  editSummary: string;
}) {
  const changed = changedFields.length ? ` Changed: ${changedFields.join(", ")}.` : "";
  const summary = editSummary && editSummary !== "Problem edited" ? ` Summary: ${editSummary}.` : "";
  return `${actorName} edited "${title}".${changed}${summary}`;
}

async function requireProblemHintEditor(problemId: number) {
  const user = await requireVerifiedUser();
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, authorId: true, slug: true, language: true, translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  if (!(await canPublishProblemEditForProblem(user, problem))) {
    throw new Error("You cannot edit hints for this problem directly.");
  }
  await assertRateLimit(`problem-hint:${user.id}`, 60, 60_000);
  return { problem, user };
}

async function revalidateProblemHintFamily(translationGroupId: string) {
  const problems = await prisma.problem.findMany({
    where: { translationGroupId },
    select: { slug: true }
  });
  for (const problem of problems) {
    revalidatePath(`/problems/${problem.slug}`);
    revalidatePath(`/problems/${problem.slug}/edit`);
  }
}

async function createProblemHint(
  problemId: number,
  formData: FormData
) {
  const { problem, user } = await requireProblemHintEditor(problemId);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Hint");
  const lastHint = await prisma.problemHint.findFirst({
    where: { problemId },
    orderBy: { position: "desc" },
    select: { position: true }
  });
  const sourceHintId = Number(formData.get("sourceHintId"));
  let position = intField(formData.get("position"), (lastHint?.position ?? -1) + 1);
  let translationGroupId: string | undefined;
  let translatedSourceHint: { id: number; authorId: number | null } | null = null;
  if (Number.isInteger(sourceHintId) && sourceHintId > 0) {
    const sourceHint = await prisma.problemHint.findFirst({
      where: {
        id: sourceHintId,
        problem: { translationGroupId: problem.translationGroupId }
      },
      select: { id: true, position: true, translationGroupId: true, authorId: true }
    });
    if (!sourceHint) throw new Error("Source hint not found.");
    const existingTranslation = await prisma.problemHint.findFirst({
      where: { problemId, translationGroupId: sourceHint.translationGroupId },
      select: { id: true }
    });
    if (existingTranslation) throw new Error("This hint already has a translation on this problem.");
    position = sourceHint.position;
    translationGroupId = sourceHint.translationGroupId;
    translatedSourceHint = sourceHint;
  }

  await prisma.problemHint.create({
    data: {
      problemId,
      authorId: translatedSourceHint?.authorId ?? user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      position,
      ...(translationGroupId
        ? {
            translationGroupId,
            translatedFromHintId: translatedSourceHint?.id,
            translatedById: translatedSourceHint?.authorId === user.id ? null : user.id
          }
        : {})
    }
  });

  await revalidateProblemHintFamily(problem.translationGroupId);
  return problem;
}

export async function createProblemHintAction(problemId: number, problemSlug: string, formData: FormData) {
  await createProblemHint(problemId, formData);
  redirect(`/problems/${problemSlug}/edit?hints=created` as Route);
}

export async function createProblemHintFromProblemAction(problemId: number, formData: FormData) {
  await createProblemHint(problemId, formData);
}

export async function updateProblemHintAction(hintId: number, problemSlug: string, formData: FormData) {
  const hint = await prisma.problemHint.findUnique({
    where: { id: hintId },
    select: { problemId: true }
  });
  if (!hint) throw new Error("Hint not found.");
  const { problem } = await requireProblemHintEditor(hint.problemId);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Hint");

  await prisma.problemHint.update({
    where: { id: hintId },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      position: intField(formData.get("position"), 0)
    }
  });

  await revalidateProblemHintFamily(problem.translationGroupId);
  redirect(`/problems/${problemSlug}/edit?hints=updated` as Route);
}

export async function deleteProblemHintAction(hintId: number, problemSlug: string) {
  const hint = await prisma.problemHint.findUnique({
    where: { id: hintId },
    select: { problemId: true }
  });
  if (!hint) throw new Error("Hint not found.");
  const { problem } = await requireProblemHintEditor(hint.problemId);
  await prisma.problemHint.delete({ where: { id: hintId } });

  await revalidateProblemHintFamily(problem.translationGroupId);
  redirect(`/problems/${problemSlug}/edit?hints=deleted` as Route);
}

export async function createProblemAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:create:${user.id}`, 5, 60_000);
  const title = boundedText(formData.get("title"), CONTENT_LIMITS.title, "Title") || "Untitled problem";
  const language = requireActiveContentLanguage(formData.get("language"));
  const translationGroupId = parseTranslationGroupId(formData.get("translationGroupId"));
  const translationSourceSlug = ensureSlug(String(formData.get("translationSourceSlug") ?? ""), "");
  const allowMissingTranslationLinks = translationLinkOverrideRequested(formData);
  const allowSameTranslationTitle = sameTranslationTitleOverrideRequested(formData);
  const bodyMarkdown =
    boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement") || "Statement to be written.";
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domains = parseProblemDomains(formData.getAll("domains"), formData.get("domain"), formData.getAll("domainSpoilers"));
  const domain = domains.find((item) => !item.spoiler)?.domain ?? MathDomain.OTHER;
  const origin = normalizeProblemOrigin(boundedText(formData.get("origin"), CONTENT_LIMITS.shortText, "Origin"));
  const originChapter = optionalBoundedText(formData.get("originChapter"), CONTENT_LIMITS.shortText, "Origin chapter");
  const originPage = optionalBoundedText(formData.get("originPage"), CONTENT_LIMITS.shortText, "Origin page");
  const originNote = optionalBoundedText(formData.get("originNote"), CONTENT_LIMITS.longNote, "Origin note");
  const listed = formData.get("listed") === "on";
  const isExercise = formData.get("isExercise") === "on";
  const showRelatedProblems = formData.get("showRelatedProblems") === "on";
  const verificationMode = parseProblemVerificationMode(formData.get("verificationMode"));
  const verificationPrompt = optionalBoundedText(
    formData.get("verificationPrompt"),
    CONTENT_LIMITS.mediumText,
    "Verification prompt"
  );
  const verificationAnswer = optionalBoundedText(
    formData.get("verificationAnswer"),
    CONTENT_LIMITS.mediumText,
    "Verification answer"
  );
  const addToExplorationSlug = ensureSlug(
    String(formData.get("addToExplorationSlug") ?? formData.get("addToPlaylistSlug") ?? ""),
    ""
  );
  const parentProblemSlug = ensureSlug(String(formData.get("parentProblemSlug") ?? ""), "");
  const contestSlug = ensureSlug(String(formData.get("contestSlug") ?? ""), "");
  const qualityStatus = QualityStatus.UNREVIEWED;
  const styles = parseProblemStyles(formData.getAll("styles"));
  const isConjecture = formData.get("isConjecture") === "on";
  const relatedProblemGroups = boundedText(
    formData.get("relatedProblemGroups"),
    CONTENT_LIMITS.relationGroups,
    "Related problem groups"
  );
  const translatedHintIds = parseSelectedTranslationIds(formData.getAll("translateHintIds"));
  const translatedProofIds = parseSelectedTranslationIds(formData.getAll("translateProofIds"));
  const translatedProofHintIds = parseSelectedTranslationIds(formData.getAll("translateProofHintIds"));
  const translatedHintBodies = new Map(
    await Promise.all(
      translatedHintIds.map(async (sourceId) => {
        const markdown = requiredBoundedText(
          formData.get(translationBodyFieldName(TRANSLATED_HINT_BODY_PREFIX, sourceId)),
          CONTENT_LIMITS.discussionPost,
          "Translated hint"
        );
        return [sourceId, { markdown, html: await renderMarkdownContent(markdown) }] as const;
      })
    )
  );
  const translatedProofBodies = new Map(
    await Promise.all(
      translatedProofIds.map(async (sourceId) => {
        const markdown = requiredBoundedText(
          formData.get(translationBodyFieldName(TRANSLATED_PROOF_BODY_PREFIX, sourceId)),
          CONTENT_LIMITS.markdown,
          "Translated solution"
        );
        return [sourceId, { markdown, html: await renderMarkdownContent(markdown) }] as const;
      })
    )
  );
  const translatedProofHintBodies = new Map(
    await Promise.all(
      translatedProofHintIds.map(async (sourceId) => {
        const markdown = requiredBoundedText(
          formData.get(translationBodyFieldName(TRANSLATED_PROOF_HINT_BODY_PREFIX, sourceId)),
          CONTENT_LIMITS.discussionPost,
          "Translated solution hint"
        );
        return [sourceId, { markdown, html: await renderMarkdownContent(markdown) }] as const;
      })
    )
  );

  if (verificationMode === ProblemVerificationMode.SELF_CHECK && !verificationAnswer) {
    throw new Error("Short answer verification requires an expected answer.");
  }

  const translationSourceIdentity =
    translationGroupId && translationSourceSlug
      ? await prisma.problem.findFirst({
          where: { slug: translationSourceSlug, translationGroupId },
          select: { title: true }
        })
      : null;
  if (translationGroupId && !translationSourceIdentity) {
    throw new Error("The selected problem translation source does not belong to this translation group.");
  }
  if (translationSourceIdentity) {
    assertTranslationTitleChanged(translationSourceIdentity.title, title, allowSameTranslationTitle);
  }

  const slug = await uniqueSlug("problem", title, translationGroupId ? language : undefined);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const problem = await prisma.$transaction(async (tx) => {
    await assertDailyContentCreationQuota(tx, user);
    if (translationGroupId) {
      const existingTranslation = await tx.problem.findFirst({
        where: { translationGroupId, language },
        select: { slug: true }
      });
      if (existingTranslation) {
        throw new Error("A problem translation already exists in this language.");
      }
    }
    const translationSource =
      translationGroupId && translationSourceSlug
        ? await tx.problem.findFirst({
            where: { slug: translationSourceSlug, translationGroupId },
            include: problemRevisionSnapshotInclude
          })
        : null;
    if (translationGroupId && !translationSource) {
      throw new Error("The selected problem translation source does not belong to this translation group.");
    }
    if (translationSource && !allowMissingTranslationLinks) {
      await assertTranslationWikiLinksPreserved(
        translationSource.bodyMarkdown,
        bodyMarkdown,
        translationSource.language,
        language,
        tx
      );
    }
    const originalProblem = translationGroupId
      ? await tx.problem.findFirst({
          where: { translationGroupId, translatedFromProblemId: null },
          orderBy: { createdAt: "asc" },
          include: problemRevisionSnapshotInclude
        })
      : null;
    const sharedProblem = originalProblem ?? translationSource;
    const sharedSnapshot = sharedProblem ? buildProblemRevisionSnapshot(sharedProblem) : null;
    const effectiveVerificationMode = sharedSnapshot?.verificationMode ?? verificationMode;
    if (effectiveVerificationMode === ProblemVerificationMode.SELF_CHECK && !verificationAnswer) {
      throw new Error("Short answer verification requires a translated expected answer.");
    }
    const sourceRevisionId = translationSource
      ? latestProblemTextRevisionIdFromRevisions(await tx.pageRevision.findMany({
          where: { pageType: SourceType.PROBLEM, pageId: translationSource.id },
          orderBy: { id: "asc" },
          select: { id: true, markdown: true, problemSnapshot: true }
        }))
      : null;
    const created = await tx.problem.create({
      data: {
        slug,
        language,
        ...(translationGroupId ? { translationGroupId } : {}),
        ...(translationSource
          ? {
              translatedFromProblemId: translationSource.id,
              translatedFromRevisionId: sourceRevisionId
            }
          : {}),
        title,
        bodyMarkdown,
        bodyHtml,
        difficulty: sharedSnapshot?.difficulty ?? difficulty,
        domain: sharedSnapshot?.domains.find((item) => !item.spoiler)?.domain ?? domain,
        origin: normalizeProblemOrigin(sharedSnapshot?.origin ?? origin),
        originChapter: sharedSnapshot?.originChapter ?? originChapter,
        originPage: sharedSnapshot?.originPage ?? originPage,
        originNote: sharedSnapshot?.originNote ?? originNote,
        license: sharedProblem?.license,
        listed: sharedSnapshot?.listed ?? listed,
        isExercise: sharedSnapshot?.isExercise ?? isExercise,
        isConjecture: sharedSnapshot?.isConjecture ?? isConjecture,
        styles: sharedSnapshot?.styles ?? styles,
        showRelatedProblems: sharedSnapshot?.showRelatedProblems ?? showRelatedProblems,
        ...(translationGroupId ? { createdAt: sharedProblem?.createdAt } : {}),
        canAppearOnFrontPage: sharedSnapshot?.canAppearOnFrontPage ?? false,
        status: sharedProblem?.status,
        qualityStatus,
        verificationMode: effectiveVerificationMode,
        verificationPrompt: effectiveVerificationMode === ProblemVerificationMode.NONE ? null : verificationPrompt,
        verificationAnswer: effectiveVerificationMode === ProblemVerificationMode.SELF_CHECK ? verificationAnswer : null,
        authorId: sharedProblem?.authorId ?? user.id,
        thread: { create: {} }
      }
    });
    await tx.problemFavorite.create({
      data: {
        userId: user.id,
        problemId: created.id
      }
    });
    if (translationGroupId) {
      const [groupAttempts, groupFavoriteUsers, groupProblems] = await Promise.all([
        tx.problemAttempt.findMany({
          where: { problem: { translationGroupId }, problemId: { not: created.id } },
          select: { userId: true, status: true, solvedAt: true, startedAt: true, discussionUnlockAt: true }
        }),
        tx.problemFavorite.findMany({
          where: { problem: { translationGroupId } },
          distinct: ["userId"],
          select: { userId: true }
        }),
        tx.problem.findMany({ where: { translationGroupId }, select: { id: true } })
      ]);
      const attemptsByUser = new Map<number, (typeof groupAttempts)[number]>();
      for (const attempt of groupAttempts) {
        const existing = attemptsByUser.get(attempt.userId);
        if (!existing) {
          attemptsByUser.set(attempt.userId, attempt);
          continue;
        }
        attemptsByUser.set(attempt.userId, {
          ...existing,
          status: mergedAttemptStatus(existing.status, attempt.status),
          solvedAt:
            existing.solvedAt && attempt.solvedAt
              ? existing.solvedAt < attempt.solvedAt
                ? existing.solvedAt
                : attempt.solvedAt
              : existing.solvedAt ?? attempt.solvedAt,
          startedAt: existing.startedAt < attempt.startedAt ? existing.startedAt : attempt.startedAt,
          discussionUnlockAt:
            existing.discussionUnlockAt < attempt.discussionUnlockAt
              ? existing.discussionUnlockAt
              : attempt.discussionUnlockAt
        });
      }
      if (attemptsByUser.size > 0) {
        await tx.problemAttempt.createMany({
          data: [...attemptsByUser.values()].map((attempt) => ({
            userId: attempt.userId,
            problemId: created.id,
            status: attempt.status,
            solvedAt: attempt.status === AttemptStatus.SOLVED ? attempt.solvedAt : null,
            startedAt: attempt.startedAt,
            discussionUnlockAt: attempt.discussionUnlockAt
          })),
          skipDuplicates: true
        });
      }
      if (groupFavoriteUsers.length > 0) {
        await tx.problemFavorite.createMany({
          data: groupFavoriteUsers.flatMap(({ userId }) =>
            groupProblems.map(({ id: problemId }) => ({ userId, problemId }))
          ),
          skipDuplicates: true
        });
      }
    }
    if (addToExplorationSlug) {
      const playlist = await tx.playlist.findUnique({
        where: { slug: addToExplorationSlug },
        include: { collaborators: true }
      });
      if (playlist && canEditExploration(user, playlist)) {
        const last = await tx.playlistItem.findFirst({
          where: { playlistId: playlist.id },
          orderBy: { position: "desc" }
        });
        await tx.playlistItem.create({
          data: {
            playlistId: playlist.id,
            problemId: created.id,
            position: (last?.position ?? 0) + 1
          }
        });
        const targetPage = await tx.explorationPage.findFirst({
          where: { playlistId: playlist.id },
          orderBy: [{ isStart: "desc" }, { position: "asc" }]
        });
        if (targetPage) {
          const [lastBlock, terminalBlock, blockCount] = await Promise.all([
            tx.explorationBlock.findFirst({ where: { pageId: targetPage.id }, orderBy: { position: "desc" } }),
            tx.explorationBlock.findFirst({ where: { page: { playlistId: playlist.id }, isEnd: true } }),
            tx.explorationBlock.count({ where: { page: { playlistId: playlist.id } } })
          ]);
          const graphBlock = await tx.explorationBlock.create({
            data: {
              pageId: targetPage.id,
              kind: "PROBLEM",
              problemId: created.id,
              position: (lastBlock?.position ?? 0) + 1,
              canvasX: (blockCount % 4) * 320,
              canvasY: Math.floor(blockCount / 4) * 220,
              isStart: blockCount === 0,
              isEnd: true
            }
          });
          if (terminalBlock) {
            await tx.explorationBlock.update({
              where: { id: terminalBlock.id },
              data: { continueToBlockId: graphBlock.id, isEnd: false }
            });
          }
        }
      }
    }
    if (parentProblemSlug) {
      const parentProblem = await tx.problem.findUnique({
        where: { slug: parentProblemSlug },
        select: { id: true, authorId: true }
      });
      if (parentProblem && canEditProblem(user, parentProblem)) {
        await linkSpecificProblem(tx, parentProblem.id, created.id);
      }
    }
    await syncInternalLinks(SourceType.PROBLEM, created.id, bodyMarkdown, tx, language);
    await syncProblemDomains(tx, created.id, sharedSnapshot?.domains ?? domains);
    await syncProblemRelationGroups(
      tx,
      created.id,
      sharedSnapshot ? problemSnapshotRelationInput(sharedSnapshot) : relatedProblemGroups
    );
    await syncProblemTags(
      created.id,
      sharedSnapshot ? problemSnapshotTagInput(sharedSnapshot.tags) : "",
      tx
    );
    await syncProblemSpoilerTags(
      created.id,
      sharedSnapshot ? problemSnapshotTagInput(sharedSnapshot.spoilerTags) : "",
      tx
    );
    if (contestSlug && !translationGroupId) {
      const contest = await tx.problemContest.findUnique({ where: { slug: contestSlug } });
      if (!contest || !contestIsOpen(contest)) {
        throw new Error("This contest is no longer accepting submissions.");
      }
      await tx.problemContestSubmission.upsert({
        where: { contestId_userId: { contestId: contest.id, userId: user.id } },
        create: {
          contestId: contest.id,
          userId: user.id,
          problemId: created.id,
          translationGroupId: created.translationGroupId
        },
        update: {
          problemId: created.id,
          translationGroupId: created.translationGroupId,
          placement: null
        }
      });
    }
    if (translationSource) {
      const [sourceHints, sourceProofs] = await Promise.all([
        translatedHintIds.length
          ? tx.problemHint.findMany({
              where: {
                id: { in: translatedHintIds },
                problemId: translationSource.id,
                proofId: null
              }
            })
          : [],
        translatedProofIds.length
          ? tx.problemProof.findMany({
              where: { id: { in: translatedProofIds }, problemId: translationSource.id },
              include: { hint: true }
            })
          : []
      ]);
      if (sourceHints.length !== translatedHintIds.length) {
        throw new Error("One of the selected hints does not belong to the translation source.");
      }
      if (sourceProofs.length !== translatedProofIds.length) {
        throw new Error("One of the selected solutions does not belong to the translation source.");
      }

      for (const sourceProof of sourceProofs) {
        const translatedBody = translatedProofBodies.get(sourceProof.id);
        if (!translatedBody) throw new Error("Translated solution content is missing.");
        if (!allowMissingTranslationLinks) {
          await assertTranslationWikiLinksPreserved(
            sourceProof.bodyMarkdown,
            translatedBody.markdown,
            translationSource.language,
            language,
            tx
          );
        }
        const translatedProof = await tx.problemProof.create({
          data: {
            translationGroupId: sourceProof.translationGroupId,
            problemId: created.id,
            authorId: sourceProof.authorId,
            translatedFromProofId: sourceProof.id,
            translatedById: sourceProof.authorId === user.id ? null : user.id,
            bodyMarkdown: translatedBody.markdown,
            bodyHtml: translatedBody.html,
            createdAt: sourceProof.createdAt
          }
        });
        await syncInternalLinks(SourceType.PROOF, translatedProof.id, translatedBody.markdown, tx, language);

        if (sourceProof.hint && translatedProofHintIds.includes(sourceProof.hint.id)) {
          const translatedHintBody = translatedProofHintBodies.get(sourceProof.hint.id);
          if (!translatedHintBody) throw new Error("Translated solution hint content is missing.");
          if (!allowMissingTranslationLinks) {
            await assertTranslationWikiLinksPreserved(
              sourceProof.hint.bodyMarkdown,
              translatedHintBody.markdown,
              translationSource.language,
              language,
              tx
            );
          }
          await tx.problemHint.create({
            data: {
              translationGroupId: sourceProof.hint.translationGroupId,
              problemId: created.id,
              proofId: translatedProof.id,
              authorId: sourceProof.hint.authorId,
              translatedFromHintId: sourceProof.hint.id,
              translatedById: sourceProof.hint.authorId === user.id ? null : user.id,
              position: sourceProof.hint.position,
              bodyMarkdown: translatedHintBody.markdown,
              bodyHtml: translatedHintBody.html,
              createdAt: sourceProof.hint.createdAt
            }
          });
        }
      }

      const selectedProofHintIds = new Set(
        sourceProofs.flatMap((proof) => (proof.hint ? [proof.hint.id] : []))
      );
      if (translatedProofHintIds.some((hintId) => !selectedProofHintIds.has(hintId))) {
        throw new Error("A solution hint can only be translated with its solution.");
      }

      for (const sourceHint of sourceHints) {
        const translatedBody = translatedHintBodies.get(sourceHint.id);
        if (!translatedBody) throw new Error("Translated hint content is missing.");
        if (!allowMissingTranslationLinks) {
          await assertTranslationWikiLinksPreserved(
            sourceHint.bodyMarkdown,
            translatedBody.markdown,
            translationSource.language,
            language,
            tx
          );
        }
        await tx.problemHint.create({
          data: {
            translationGroupId: sourceHint.translationGroupId,
            problemId: created.id,
            authorId: sourceHint.authorId,
            translatedFromHintId: sourceHint.id,
            translatedById: sourceHint.authorId === user.id ? null : user.id,
            position: sourceHint.position,
            bodyMarkdown: translatedBody.markdown,
            bodyHtml: translatedBody.html,
            createdAt: sourceHint.createdAt
          }
        });
      }
    } else if (translatedHintIds.length || translatedProofIds.length || translatedProofHintIds.length) {
      throw new Error("Accompanying content can only be translated from a linked source problem.");
    }
    const createdSnapshotSource = await problemSnapshotSource(tx, created.id);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: created.id,
        markdown: bodyMarkdown,
        problemVersion: createdSnapshotSource.version,
        problemSnapshot: problemRevisionSnapshotJson(buildProblemRevisionSnapshot(createdSnapshotSource)),
        editedById: user.id,
        isCreation: true,
        editSummary: translationSource ? "Problem translation created" : "Problem created"
      }
    });
    return {
      created,
      translationSourceTitle: translationSource?.title ?? null
    };
  });

  const problemNotification = problemCreationNotificationCopy({
    actorName: displayNameForUser(user),
    problemTitle: problem.created.title,
    sourceTitle: problem.translationSourceTitle,
    targetLanguage: problem.created.language
  });

  revalidatePath("/");
  await notifyOwnerOfSiteActivity({
    actor: user,
    type: NotificationType.PROBLEM_CREATED,
    title: problemNotification.title,
    body: problemNotification.body,
    href: `/problems/${problem.created.slug}`
  });
  redirect(contestSlug
    ? "/contest?submitted=1"
    : contentLanguageViewHref("/problems", problem.created.slug, problem.created.language) as Route);
}

export type ProblemCreateActionState = {
  error: string | null;
  errorKind?: "translation-links" | "same-translation-title";
  sameTranslationTitleConfirmed?: boolean;
};

export async function createProblemFormAction(
  _state: ProblemCreateActionState,
  formData: FormData
): Promise<ProblemCreateActionState> {
  try {
    await createProblemAction(formData);
    return { error: null };
  } catch (error) {
    if (error instanceof SameTranslationTitleError) {
      return { error: error.message, errorKind: "same-translation-title" };
    }
    if (error instanceof TranslationWikiLinksPreservedError) {
      return {
        error: error.message,
        errorKind: "translation-links",
        sameTranslationTitleConfirmed: sameTranslationTitleOverrideRequested(formData)
      };
    }
    throw error;
  }
}

export async function updateProblemAction(
  problemId: number,
  _state: ProblemEditActionState,
  formData: FormData
): Promise<ProblemEditActionState> {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:update:${user.id}`, 20, 60_000);
  const baseVersion = Number(formData.get("baseVersion"));
  if (!Number.isInteger(baseVersion) || baseVersion < 1) throw new Error("Invalid problem version.");
  const acceptedConflictVersion = Number(formData.get("acceptedConflictVersion"));
  const approvedProposalId = Number(formData.get("approvedProposalId"));
  const previous = await prisma.problem.findUnique({
    where: { id: problemId },
    include: problemRevisionSnapshotInclude
  });
  if (!previous) throw new Error("Problem not found.");
  if (!canProposeProblemEdit(user)) {
    throw new Error("You cannot propose changes to this problem.");
  }
  const publishesImmediately = await canPublishProblemEditForProblem(user, previous);
  if (Number.isInteger(approvedProposalId) && approvedProposalId > 0 && !canUseAdminTools(user)) {
    throw new Error("Only admins can approve proposed edits.");
  }

  const title = boundedText(formData.get("title"), CONTENT_LIMITS.title, "Title") || previous.title;
  const language = editableContentLanguage(formData.get("language"), previous.language);
  const bodyMarkdown =
    boundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Statement") || previous.bodyMarkdown;
  const difficulty = parseProblemDifficulty(formData.get("difficulty"));
  const domains = parseProblemDomains(formData.getAll("domains"), formData.get("domain"), formData.getAll("domainSpoilers"));
  const origin = normalizeProblemOrigin(boundedText(formData.get("origin"), CONTENT_LIMITS.shortText, "Origin"));
  const originChapter = optionalBoundedText(formData.get("originChapter"), CONTENT_LIMITS.shortText, "Origin chapter");
  const originPage = optionalBoundedText(formData.get("originPage"), CONTENT_LIMITS.shortText, "Origin page");
  const originNote = optionalBoundedText(formData.get("originNote"), CONTENT_LIMITS.longNote, "Origin note");
  const listed = formData.get("listed") === "on";
  const isExercise = formData.get("isExercise") === "on";
  const showRelatedProblems = formData.get("showRelatedProblems") === "on";
  const canAppearOnFrontPage = canUseAdminTools(user)
    ? formData.get("canAppearOnFrontPage") === "on"
    : previous.canAppearOnFrontPage;
  const verificationMode = publishesImmediately
    ? parseProblemVerificationMode(formData.get("verificationMode"))
    : previous.verificationMode;
  const verificationPrompt = publishesImmediately ? optionalBoundedText(
    formData.get("verificationPrompt"),
    CONTENT_LIMITS.mediumText,
    "Verification prompt"
  ) : previous.verificationPrompt;
  const verificationAnswer = publishesImmediately ? optionalBoundedText(
    formData.get("verificationAnswer"),
    CONTENT_LIMITS.mediumText,
    "Verification answer"
  ) : previous.verificationAnswer;
  const qualityStatusInput = formData.get("qualityStatus");
  const requestedQualityStatus = publishesImmediately && qualityStatusInput
    ? parseContributorQualityStatus(qualityStatusInput, user.role)
    : previous.qualityStatus;
  const qualityStatus =
    requestedQualityStatus === QualityStatus.REVIEWED &&
    previous.qualityStatus !== QualityStatus.REVIEWED
      ? previous.qualityStatus
      : requestedQualityStatus;
  const styles = parseProblemStyles(formData.getAll("styles"));
  const isConjecture = formData.get("isConjecture") === "on";
  const editSummary = boundedText(formData.get("editSummary"), CONTENT_LIMITS.shortText, "Edit summary") || "Problem edited";
  const markTranslationFresh = formData.get("markTranslationFresh") === "on";
  const relatedProblemGroups = boundedText(
    formData.get("relatedProblemGroups"),
    CONTENT_LIMITS.relationGroups,
    "Related problem groups"
  );

  if (verificationMode === ProblemVerificationMode.SELF_CHECK && !verificationAnswer) {
    throw new Error("Short answer verification requires an expected answer.");
  }

  const submittedSnapshot: ProblemRevisionSnapshot = {
    schemaVersion: 1,
    title,
    language,
    bodyMarkdown,
    difficulty,
    domains,
    origin,
    originChapter,
    originPage,
    originNote,
    listed,
    isExercise,
    isConjecture,
    styles,
    showRelatedProblems,
    canAppearOnFrontPage,
    status: previous.status,
    qualityStatus,
    verificationMode,
    verificationPrompt: verificationMode === ProblemVerificationMode.NONE ? null : verificationPrompt,
    verificationAnswer: verificationMode === ProblemVerificationMode.SELF_CHECK ? verificationAnswer : null,
    translatedFromRevisionId: previous.translatedFromRevisionId,
    tags: previous.tags
      .map(({ tag }) => ({ name: tag.name, slug: tag.slug }))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    spoilerTags: previous.spoilerTags
      .map(({ tag }) => ({ name: tag.name, slug: tag.slug }))
      .sort((left, right) => left.slug.localeCompare(right.slug)),
    relatedProblemGroups: parseProblemRelationGroups(relatedProblemGroups)
  };

  if (!publishesImmediately) {
    let proposal;
    try {
      proposal = await prisma.$transaction(async (tx) => {
        await acquireTransactionLock(tx, `problem-edit:${previous.translationGroupId}`);
        const current = await problemSnapshotSource(tx, problemId);
        if (current.version !== baseVersion) throw new ProblemEditConflictError(current.version);

        const currentSnapshot = buildProblemRevisionSnapshot(current);
        submittedSnapshot.status = current.status;
        submittedSnapshot.qualityStatus = current.qualityStatus;
        submittedSnapshot.canAppearOnFrontPage = current.canAppearOnFrontPage;
        submittedSnapshot.verificationMode = current.verificationMode;
        submittedSnapshot.verificationPrompt = current.verificationPrompt;
        submittedSnapshot.verificationAnswer = current.verificationAnswer;
        submittedSnapshot.translatedFromRevisionId = current.translatedFromRevisionId;
        const changedFields = changedProblemSnapshotFields(currentSnapshot, submittedSnapshot);
        if (changedFields.length === 0) return null;

        const superseded = await tx.problemEditProposal.findMany({
          where: { problemId, proposerId: user.id, status: "PENDING" },
          select: { id: true }
        });
        if (superseded.length > 0) {
          const reviewedAt = new Date();
          await tx.problemEditProposal.updateMany({
            where: { id: { in: superseded.map((item) => item.id) } },
            data: { status: "SUPERSEDED", reviewedAt }
          });
          await tx.notification.updateMany({
            where: {
              type: NotificationType.PROBLEM_EDIT_PROPOSED,
              href: { in: superseded.map((item) => `/moderation/problem-edits/${item.id}`) },
              readAt: null
            },
            data: { readAt: reviewedAt }
          });
        }
        return tx.problemEditProposal.create({
          data: {
            problemId,
            proposerId: user.id,
            baseVersion: current.version,
            snapshot: problemRevisionSnapshotJson(submittedSnapshot),
            editSummary
          }
        });
      });
    } catch (error) {
      if (!(error instanceof ProblemEditConflictError)) throw error;
      const latestRevision = await prisma.pageRevision.findFirst({
        where: { pageType: SourceType.PROBLEM, pageId: problemId },
        orderBy: { id: "desc" },
        include: { editedBy: true }
      });
      return {
        status: "conflict",
        currentVersion: error.currentVersion,
        editorName: latestRevision?.editedBy ? displayNameForUser(latestRevision.editedBy) : null,
        editedAt: latestRevision?.createdAt.toISOString() ?? null,
        conflictingFields: []
      };
    }

    if (proposal) {
      await notifyAdminsOfProblemEditProposal({
        actorId: user.id,
        actorName: displayNameForUser(user),
        problemTitle: previous.title,
        proposalId: proposal.id
      });
    }
    redirect(
      contentLanguageViewHref("/problems", previous.slug, previous.language, {
        editProposal: proposal ? "submitted" : "unchanged"
      }) as Route
    );
  }

  let problem;
  try {
    problem = await prisma.$transaction(async (tx) => {
      await acquireTransactionLock(tx, `problem-edit:${previous.translationGroupId}`);
      const current = await problemSnapshotSource(tx, problemId);
      const approvedProposal = Number.isInteger(approvedProposalId) && approvedProposalId > 0
        ? await tx.problemEditProposal.findFirst({
            where: { id: approvedProposalId, problemId, status: "PENDING" },
            select: { id: true, proposerId: true, proposer: true }
          })
        : null;
      if (approvedProposalId > 0 && !approvedProposal) throw new Error("This proposed edit is no longer pending.");
      await ensureProblemSnapshotRevision(tx, current);
      const currentSnapshot = buildProblemRevisionSnapshot(current);
      let resolvedSnapshot = submittedSnapshot;
      let autoMerged = false;

      if (current.version !== baseVersion) {
        const baseRevision = await tx.pageRevision.findFirst({
          where: {
            pageType: SourceType.PROBLEM,
            pageId: problemId,
            problemVersion: baseVersion,
            problemSnapshot: { not: Prisma.JsonNull }
          },
          orderBy: { id: "desc" }
        });
        const baseSnapshot = parseProblemRevisionSnapshot(baseRevision?.problemSnapshot ?? null);
        if (!baseSnapshot) throw new ProblemEditConflictError(current.version);
        const merge = mergeProblemRevisionSnapshots(baseSnapshot, currentSnapshot, submittedSnapshot);
        if (merge.conflicts.length && acceptedConflictVersion !== current.version) {
          throw new ProblemEditConflictError(
            current.version,
            merge.conflicts.map((field) => PROBLEM_SNAPSHOT_FIELD_LABELS[field])
          );
        }
        resolvedSnapshot = merge.merged;
        autoMerged = true;
      }

      resolvedSnapshot.status = current.status;
      resolvedSnapshot.translatedFromRevisionId = current.translatedFromRevisionId;
      const changedSnapshotFields = changedProblemSnapshotFields(currentSnapshot, resolvedSnapshot);
      const hasReviewSensitiveChanges = hasProblemReviewSensitiveChanges(changedSnapshotFields);
      if (
        current.qualityStatus === QualityStatus.REVIEWED &&
        hasReviewSensitiveChanges
      ) {
        resolvedSnapshot.qualityStatus = QualityStatus.UNREVIEWED;
      }
      const needsReviewAfterEdit = needsReviewAfterProblemEdit({
        alreadyNeedsReview: current.needsReviewAfterEdit,
        currentStatus: current.qualityStatus,
        hasReviewSensitiveChanges
      });
      if (resolvedSnapshot.language !== current.language) {
        const existingTranslation = await tx.problem.findFirst({
          where: {
            id: { not: problemId },
            translationGroupId: current.translationGroupId,
            language: resolvedSnapshot.language
          },
          select: { slug: true }
        });
        if (existingTranslation) throw new Error("A problem translation already exists in this language.");
      }

      if (markTranslationFresh && current.translatedFromProblemId) {
        const refreshedSourceRevisionId = latestProblemTextRevisionIdFromRevisions(await tx.pageRevision.findMany({
          where: { pageType: SourceType.PROBLEM, pageId: current.translatedFromProblemId },
          orderBy: { id: "asc" },
          select: { id: true, markdown: true, problemSnapshot: true }
        }));
        if (refreshedSourceRevisionId) resolvedSnapshot.translatedFromRevisionId = refreshedSourceRevisionId;
      }

      const bodyHtml = await renderMarkdownContent(resolvedSnapshot.bodyMarkdown);
      const updateResult = await tx.problem.updateMany({
        where: { id: problemId, version: current.version },
        data: {
          title: resolvedSnapshot.title,
          language: resolvedSnapshot.language,
          bodyMarkdown: resolvedSnapshot.bodyMarkdown,
          bodyHtml,
          difficulty: resolvedSnapshot.difficulty,
          domain: resolvedSnapshot.domains.find((item) => !item.spoiler)?.domain ?? MathDomain.OTHER,
          origin: resolvedSnapshot.origin,
          originChapter: resolvedSnapshot.originChapter,
          originPage: resolvedSnapshot.originPage,
          originNote: resolvedSnapshot.originNote,
          listed: resolvedSnapshot.listed,
          isExercise: resolvedSnapshot.isExercise,
          isConjecture: resolvedSnapshot.isConjecture,
          styles: resolvedSnapshot.styles,
          showRelatedProblems: resolvedSnapshot.showRelatedProblems,
          canAppearOnFrontPage: resolvedSnapshot.canAppearOnFrontPage,
          qualityStatus: resolvedSnapshot.qualityStatus,
          needsReviewAfterEdit,
          verificationMode: resolvedSnapshot.verificationMode,
          verificationPrompt: resolvedSnapshot.verificationPrompt,
          verificationAnswer: resolvedSnapshot.verificationAnswer,
          translatedFromRevisionId: resolvedSnapshot.translatedFromRevisionId,
          version: { increment: 1 }
        }
      });
      if (updateResult.count !== 1) throw new ProblemEditConflictError(current.version + 1);

      const sharedChangedFields = problemTranslationSharedChanges(changedSnapshotFields);
      const sharedChangedFieldSet = new Set(sharedChangedFields);
      const siblingCandidates = sharedChangedFields.length
        ? await tx.problem.findMany({
            where: { translationGroupId: current.translationGroupId, id: { not: problemId } },
            select: { id: true }
          })
        : [];
      for (const sibling of siblingCandidates) {
        await ensureProblemSnapshotRevision(tx, await problemSnapshotSource(tx, sibling.id));
      }
      if (siblingCandidates.length) {
        await tx.problem.updateMany({
          where: { id: { in: siblingCandidates.map((item) => item.id) } },
          data: {
            ...(sharedChangedFieldSet.has("difficulty") ? { difficulty: resolvedSnapshot.difficulty } : {}),
            ...(sharedChangedFieldSet.has("domains")
              ? {
                  domain:
                    resolvedSnapshot.domains.find((item) => !item.spoiler)?.domain ?? MathDomain.OTHER
                }
              : {}),
            ...(sharedChangedFieldSet.has("origin") ? { origin: resolvedSnapshot.origin } : {}),
            ...(sharedChangedFieldSet.has("originChapter")
              ? { originChapter: resolvedSnapshot.originChapter }
              : {}),
            ...(sharedChangedFieldSet.has("originPage") ? { originPage: resolvedSnapshot.originPage } : {}),
            ...(sharedChangedFieldSet.has("listed") ? { listed: resolvedSnapshot.listed } : {}),
            ...(sharedChangedFieldSet.has("isExercise") ? { isExercise: resolvedSnapshot.isExercise } : {}),
            ...(sharedChangedFieldSet.has("isConjecture") ? { isConjecture: resolvedSnapshot.isConjecture } : {}),
            ...(sharedChangedFieldSet.has("styles") ? { styles: resolvedSnapshot.styles } : {}),
            ...(sharedChangedFieldSet.has("showRelatedProblems")
              ? { showRelatedProblems: resolvedSnapshot.showRelatedProblems }
              : {}),
            ...(sharedChangedFieldSet.has("canAppearOnFrontPage")
              ? { canAppearOnFrontPage: resolvedSnapshot.canAppearOnFrontPage }
              : {}),
            version: { increment: 1 }
          }
        });
        for (const sibling of siblingCandidates) {
          if (sharedChangedFieldSet.has("domains")) {
            await syncProblemDomains(tx, sibling.id, resolvedSnapshot.domains);
          }
          if (sharedChangedFieldSet.has("tags")) {
            await syncProblemTags(sibling.id, problemSnapshotTagInput(resolvedSnapshot.tags), tx);
          }
          if (sharedChangedFieldSet.has("spoilerTags")) {
            await syncProblemSpoilerTags(sibling.id, problemSnapshotTagInput(resolvedSnapshot.spoilerTags), tx);
          }
        }
      }

      await syncInternalLinks(SourceType.PROBLEM, problemId, resolvedSnapshot.bodyMarkdown, tx, resolvedSnapshot.language);
      await syncProblemDomains(tx, problemId, resolvedSnapshot.domains);
      await syncProblemRelationGroups(tx, problemId, problemSnapshotRelationInput(resolvedSnapshot));
      await syncProblemTags(problemId, problemSnapshotTagInput(resolvedSnapshot.tags), tx);
      await syncProblemSpoilerTags(problemId, problemSnapshotTagInput(resolvedSnapshot.spoilerTags), tx);

      const updated = await problemSnapshotSource(tx, problemId);
      const revision = await tx.pageRevision.create({
        data: {
          pageType: SourceType.PROBLEM,
          pageId: updated.id,
          markdown: updated.bodyMarkdown,
          problemVersion: updated.version,
          problemSnapshot: problemRevisionSnapshotJson(buildProblemRevisionSnapshot(updated)),
          editedById: approvedProposal?.proposerId ?? user.id,
          editSummary: autoMerged ? `${editSummary} (merged with concurrent changes)` : editSummary
        },
        select: { id: true }
      });

      if (approvedProposal) {
        const reviewedAt = new Date();
        await tx.problemEditProposal.update({
          where: { id: approvedProposal.id },
          data: {
            status: "APPROVED",
            reviewedById: user.id,
            reviewedAt
          }
        });
        await tx.notification.updateMany({
          where: {
            type: NotificationType.PROBLEM_EDIT_PROPOSED,
            href: `/moderation/problem-edits/${approvedProposal.id}`,
            readAt: null
          },
          data: { readAt: reviewedAt }
        });
      }

      const siblingSlugs: string[] = [];
      for (const sibling of siblingCandidates) {
        const siblingAfter = await problemSnapshotSource(tx, sibling.id);
        siblingSlugs.push(siblingAfter.slug);
        await tx.pageRevision.create({
          data: {
            pageType: SourceType.PROBLEM,
            pageId: siblingAfter.id,
            markdown: siblingAfter.bodyMarkdown,
            problemVersion: siblingAfter.version,
            problemSnapshot: problemRevisionSnapshotJson(buildProblemRevisionSnapshot(siblingAfter)),
            editedById: approvedProposal?.proposerId ?? user.id,
            editSummary: `Shared settings updated from ${updated.language} translation`
          }
        });
      }

      const changedFields = changedProblemSnapshotFields(currentSnapshot, buildProblemRevisionSnapshot(updated)).map(
        (field) => PROBLEM_SNAPSHOT_FIELD_LABELS[field]
      );
      return {
        updated,
        revisionId: revision.id,
        changedFields,
        siblingSlugs,
        previousTitle: current.title,
        approvedProposal
      };
    });
  } catch (error) {
    if (!(error instanceof ProblemEditConflictError)) throw error;
    const latestRevision = await prisma.pageRevision.findFirst({
      where: { pageType: SourceType.PROBLEM, pageId: problemId },
      orderBy: { id: "desc" },
      include: { editedBy: true }
    });
    return {
      status: "conflict",
      currentVersion: error.currentVersion,
      editorName: latestRevision?.editedBy ? displayNameForUser(latestRevision.editedBy) : null,
      editedAt: latestRevision?.createdAt.toISOString() ?? null,
      conflictingFields: error.conflictingFields
    };
  }

  revalidatePath("/");
  revalidatePath(`/problems/${problem.updated.slug}`);
  revalidatePath(`/problems/${problem.updated.slug}/history`);
  for (const siblingSlug of problem.siblingSlugs) {
    revalidatePath(`/problems/${siblingSlug}`);
    revalidatePath(`/problems/${siblingSlug}/edit`);
    revalidatePath(`/problems/${siblingSlug}/history`);
  }
  await notifyProblemEditSubscribers({
    problemId,
    actorId: problem.approvedProposal?.proposerId ?? user.id,
    title: "Problem edited",
    body: problemEditNotificationBody({
      actorName: problem.approvedProposal?.proposer
        ? displayNameForUser(problem.approvedProposal.proposer)
        : displayNameForUser(user),
      title: problem.previousTitle,
      changedFields: problem.changedFields,
      editSummary
    }),
    href: `/problems/${problem.updated.slug}/history#revision-${problem.revisionId}`
  });
  if (problem.approvedProposal) {
    await createNotification({
      userId: problem.approvedProposal.proposerId,
      actorId: user.id,
      type: NotificationType.PROBLEM_EDIT_APPROVED,
      title: "Proposed edit approved",
      body: `Your proposed changes to "${problem.previousTitle}" are now public.`,
      href: `/problems/${problem.updated.slug}/history#revision-${problem.revisionId}`
    });
  }
  redirect(contentLanguageViewHref("/problems", problem.updated.slug, problem.updated.language) as Route);
}

export async function approveProblemEditProposalAction(proposalId: number) {
  const user = await requireVerifiedUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can approve proposed edits.");
  await assertRateLimit(`problem-proposal-review:${user.id}`, 40, 60_000);

  const proposal = await prisma.problemEditProposal.findFirst({
    where: { id: proposalId, status: "PENDING" },
    include: { problem: true }
  });
  if (!proposal) throw new Error("This proposed edit is no longer pending.");
  const snapshot = parseProblemRevisionSnapshot(proposal.snapshot);
  if (!snapshot) throw new Error("This proposed edit is invalid.");

  const formData = new FormData();
  formData.set("baseVersion", String(proposal.baseVersion));
  formData.set("approvedProposalId", String(proposal.id));
  formData.set("title", snapshot.title);
  formData.set("language", snapshot.language);
  formData.set("bodyMarkdown", snapshot.bodyMarkdown);
  if (snapshot.difficulty !== null) formData.set("difficulty", String(snapshot.difficulty));
  for (const domain of snapshot.domains) {
    formData.append("domains", domain.mscCode);
    if (domain.spoiler) formData.append("domainSpoilers", domain.mscCode);
  }
  formData.set("origin", snapshot.origin);
  if (snapshot.originChapter) formData.set("originChapter", snapshot.originChapter);
  if (snapshot.originPage) formData.set("originPage", snapshot.originPage);
  if (snapshot.originNote) formData.set("originNote", snapshot.originNote);
  if (snapshot.listed) formData.set("listed", "on");
  if (snapshot.isExercise) formData.set("isExercise", "on");
  if (snapshot.isConjecture) formData.set("isConjecture", "on");
  for (const style of snapshot.styles) formData.append("styles", style);
  if (snapshot.showRelatedProblems) formData.set("showRelatedProblems", "on");
  if (snapshot.canAppearOnFrontPage) formData.set("canAppearOnFrontPage", "on");
  formData.set("qualityStatus", snapshot.qualityStatus);
  formData.set("verificationMode", snapshot.verificationMode);
  if (snapshot.verificationPrompt) formData.set("verificationPrompt", snapshot.verificationPrompt);
  if (snapshot.verificationAnswer) formData.set("verificationAnswer", snapshot.verificationAnswer);
  formData.set("relatedProblemGroups", problemSnapshotRelationInput(snapshot));
  formData.set("editSummary", proposal.editSummary || "Community edit approved");

  const result = await updateProblemAction(proposal.problemId, { status: "idle" }, formData);
  if (result.status === "conflict") {
    redirect(`/moderation/problem-edits/${proposal.id}?conflict=1` as Route);
  }
}

export async function rejectProblemEditProposalAction(proposalId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can reject proposed edits.");
  await assertRateLimit(`problem-proposal-review:${user.id}`, 40, 60_000);
  const reviewNote = optionalBoundedText(formData.get("reviewNote"), CONTENT_LIMITS.longNote, "Review note");
  const proposal = await prisma.$transaction(async (tx) => {
    const reviewedAt = new Date();
    const rejected = await tx.problemEditProposal.update({
      where: { id: proposalId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: user.id,
        reviewedAt,
        reviewNote
      },
      include: { problem: { select: { slug: true, title: true } } }
    });
    await tx.notification.updateMany({
      where: {
        type: NotificationType.PROBLEM_EDIT_PROPOSED,
        href: `/moderation/problem-edits/${proposalId}`,
        readAt: null
      },
      data: { readAt: reviewedAt }
    });
    return rejected;
  });
  await createNotification({
    userId: proposal.proposerId,
    actorId: user.id,
    type: NotificationType.PROBLEM_EDIT_REJECTED,
    title: "Proposed edit not accepted",
    body: reviewNote
      ? `Your proposed changes to "${proposal.problem.title}" were not accepted: ${reviewNote}`
      : `Your proposed changes to "${proposal.problem.title}" were not accepted.`,
    href: `/problems/${proposal.problem.slug}`
  });
  revalidatePath("/moderation");
  redirect("/moderation" as Route);
}

export async function dismissProblemTranslationStaleNoticeAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:translation-dismiss:${user.id}`, 30, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      slug: true,
      language: true,
      translatedFromProblem: { select: { id: true, authorId: true } }
    }
  });

  if (!problem?.translatedFromProblem) {
    throw new Error("Translation source not found.");
  }
  if (problem.translatedFromProblem.authorId !== user.id && !canUseAdminTools(user)) {
    throw new Error("You cannot dismiss this translation notice.");
  }

  const latestSourceRevisionId = latestProblemTextRevisionIdFromRevisions(await prisma.pageRevision.findMany({
    where: { pageType: SourceType.PROBLEM, pageId: problem.translatedFromProblem.id },
    orderBy: { id: "asc" },
    select: { id: true, markdown: true, problemSnapshot: true }
  }));
  if (!latestSourceRevisionId) {
    throw new Error("Source revision not found.");
  }

  await prisma.problem.update({
    where: { id: problemId },
    data: { translatedFromRevisionId: latestSourceRevisionId }
  });

  revalidatePath(`/problems/${problem.slug}`);
  redirect(contentLanguageViewHref("/problems", problem.slug, problem.language) as Route);
}

export async function deleteProblemAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:delete:${user.id}`, 10, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, slug: true, translationGroupId: true }
  });

  if (!problem) throw new Error("Problem not found.");
  const problemFamily = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    orderBy: { createdAt: "asc" },
    select: { authorId: true, translatedFromProblemId: true }
  });
  const familyOwner = problemFamily.find((translation) => translation.translatedFromProblemId === null)
    ?? problemFamily[0];
  if (!familyOwner || !canArchiveProblem(user, familyOwner)) {
    throw new Error("You cannot delete this problem.");
  }

  const archivedSlugs: string[] = [];
  await prisma.$transaction(async (tx) => {
    await acquireTransactionLock(tx, `problem-edit:${problem.translationGroupId}`);
    const activeTranslations = await tx.problem.findMany({
      where: {
        translationGroupId: problem.translationGroupId,
        status: { not: ProblemStatus.ARCHIVED }
      },
      orderBy: { id: "asc" },
      include: problemRevisionSnapshotInclude
    });

    for (const translation of activeTranslations) {
      await ensureProblemSnapshotRevision(tx, translation);
    }

    const activeIds = activeTranslations.map((translation) => translation.id);
    if (activeIds.length === 0) return;

    await tx.problem.updateMany({
      where: { id: { in: activeIds } },
      data: {
        status: ProblemStatus.ARCHIVED,
        listed: false,
        version: { increment: 1 }
      }
    });
    await tx.internalLink.deleteMany({
      where: {
        sourceType: SourceType.PROBLEM,
        sourceId: { in: activeIds }
      }
    });

    for (const translation of activeTranslations) {
      const archived = await problemSnapshotSource(tx, translation.id);
      await tx.pageRevision.create({
        data: {
          pageType: SourceType.PROBLEM,
          pageId: translation.id,
          markdown: archived.bodyMarkdown,
          problemVersion: archived.version,
          problemSnapshot: problemRevisionSnapshotJson(buildProblemRevisionSnapshot(archived)),
          editedById: user.id,
          editSummary: "Problem deleted"
        }
      });
      archivedSlugs.push(translation.slug);
    }
  });

  revalidatePath("/");
  revalidatePath("/problems");
  for (const slug of archivedSlugs) {
    revalidatePath(`/problems/${slug}`);
  }
  redirect("/problems");
}

export async function markProblemReviewedAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:review:${user.id}`, 30, 60_000);
  await prisma.$transaction(async (tx) => {
    const problem = await problemSnapshotSource(tx, problemId);
    if (!canReviewProblem(user, problem)) {
      throw new Error("You cannot review this problem.");
    }
    await acquireTransactionLock(tx, `problem-edit:${problem.translationGroupId}`);
    const current = await problemSnapshotSource(tx, problemId);
    if (!canReviewProblem(user, current)) {
      throw new Error("You cannot review this problem.");
    }
    await ensureProblemSnapshotRevision(tx, current);
    const reviewed = await tx.problem.update({
      where: { id: problemId },
      data: {
        qualityStatus: QualityStatus.REVIEWED,
        needsReviewAfterEdit: false,
        version: { increment: 1 }
      }
    });
    const reviewedSnapshot = await problemSnapshotSource(tx, reviewed.id);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: reviewed.id,
        markdown: reviewedSnapshot.bodyMarkdown,
        problemVersion: reviewedSnapshot.version,
        problemSnapshot: problemRevisionSnapshotJson(buildProblemRevisionSnapshot(reviewedSnapshot)),
        editedById: user.id,
        editSummary: "Problem reviewed"
      }
    });
  });

  revalidatePath("/problems");
  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/edit`);
  revalidatePath(`/problems/${problemSlug}/history`);
}

export async function rollbackProblemRevisionAction(problemId: number, revisionId: number, expectedVersion: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:rollback:${user.id}`, 8, 60_000);
  const [revision, existingProblem] = await Promise.all([
    prisma.pageRevision.findFirst({
      where: {
        id: revisionId,
        pageType: SourceType.PROBLEM,
        pageId: problemId
      }
    }),
    prisma.problem.findUnique({
      where: { id: problemId },
      select: { authorId: true, translationGroupId: true }
    })
  ]);

  if (!revision) throw new Error("Revision not found.");
  if (!existingProblem) throw new Error("Problem not found.");
  if (!canRollbackProblem(user, existingProblem)) {
    throw new Error("You cannot roll back this problem.");
  }

  const problem = await prisma.$transaction(async (tx) => {
    await acquireTransactionLock(tx, `problem-edit:${existingProblem.translationGroupId}`);
    const current = await problemSnapshotSource(tx, problemId);
    if (current.version !== expectedVersion) {
      throw new Error("This problem changed after the history page was opened. Reload before rolling back.");
    }
    await ensureProblemSnapshotRevision(tx, current);

    const snapshot = parseProblemRevisionSnapshot(revision.problemSnapshot);
    const markdown = snapshot?.bodyMarkdown ?? revision.markdown;
    const hasReviewSensitiveChanges = hasProblemReviewSensitiveChanges([
      ...(snapshot && snapshot.title !== current.title ? ["title"] : []),
      ...(markdown !== current.bodyMarkdown ? ["bodyMarkdown"] : [])
    ]);
    const qualityStatus =
      current.qualityStatus === QualityStatus.REVIEWED && hasReviewSensitiveChanges
        ? QualityStatus.UNREVIEWED
        : current.qualityStatus;
    const updateResult = await tx.problem.updateMany({
      where: { id: problemId, version: expectedVersion },
      data: {
        ...(snapshot
          ? {
              title: snapshot.title,
              language: snapshot.language,
              difficulty: snapshot.difficulty,
              domain: snapshot.domains.find((item) => !item.spoiler)?.domain ?? MathDomain.OTHER,
              origin: snapshot.origin,
              originChapter: snapshot.originChapter,
              originPage: snapshot.originPage,
              originNote: snapshot.originNote,
              listed: snapshot.listed,
              isExercise: snapshot.isExercise,
              isConjecture: snapshot.isConjecture,
              styles: snapshot.styles,
              showRelatedProblems: snapshot.showRelatedProblems,
              canAppearOnFrontPage: snapshot.canAppearOnFrontPage,
              status: snapshot.status,
              qualityStatus,
              verificationMode: snapshot.verificationMode,
              verificationPrompt: snapshot.verificationPrompt,
              verificationAnswer: snapshot.verificationAnswer,
              translatedFromRevisionId: snapshot.translatedFromRevisionId
            }
          : {}),
        bodyMarkdown: markdown,
        bodyHtml: await renderMarkdownContent(markdown),
        needsReviewAfterEdit: needsReviewAfterProblemEdit({
          alreadyNeedsReview: current.needsReviewAfterEdit,
          currentStatus: current.qualityStatus,
          hasReviewSensitiveChanges
        }),
        version: { increment: 1 }
      }
    });
    if (updateResult.count !== 1) throw new Error("This problem changed while the rollback was being applied.");

    await syncInternalLinks(SourceType.PROBLEM, problemId, markdown, tx, snapshot?.language ?? current.language);
    if (snapshot) {
      await syncProblemDomains(tx, problemId, snapshot.domains);
      await syncProblemRelationGroups(tx, problemId, problemSnapshotRelationInput(snapshot));
      await syncProblemTags(problemId, problemSnapshotTagInput(snapshot.tags), tx);
      await syncProblemSpoilerTags(problemId, problemSnapshotTagInput(snapshot.spoilerTags), tx);
    }

    const siblingCandidates = snapshot
      ? await tx.problem.findMany({
          where: {
            translationGroupId: current.translationGroupId,
            id: { not: problemId },
            OR: [
              snapshot.difficulty === null
                ? { difficulty: { not: null } }
                : { OR: [{ difficulty: null }, { difficulty: { not: snapshot.difficulty } }] },
              { canAppearOnFrontPage: { not: snapshot.canAppearOnFrontPage } },
              { isExercise: { not: snapshot.isExercise } },
              { isConjecture: { not: snapshot.isConjecture } },
              { NOT: { styles: { equals: snapshot.styles } } },
              { showRelatedProblems: { not: snapshot.showRelatedProblems } }
            ]
          },
          select: { id: true }
        })
      : [];
    for (const sibling of siblingCandidates) {
      await ensureProblemSnapshotRevision(tx, await problemSnapshotSource(tx, sibling.id));
    }
    if (snapshot && siblingCandidates.length) {
      await tx.problem.updateMany({
        where: { id: { in: siblingCandidates.map((item) => item.id) } },
        data: {
          difficulty: snapshot.difficulty,
          isExercise: snapshot.isExercise,
          isConjecture: snapshot.isConjecture,
          styles: snapshot.styles,
          showRelatedProblems: snapshot.showRelatedProblems,
          canAppearOnFrontPage: snapshot.canAppearOnFrontPage,
          version: { increment: 1 }
        }
      });
    }

    const restored = await problemSnapshotSource(tx, problemId);
    await tx.pageRevision.create({
      data: {
        pageType: SourceType.PROBLEM,
        pageId: problemId,
        markdown: restored.bodyMarkdown,
        problemVersion: restored.version,
        problemSnapshot: problemRevisionSnapshotJson(buildProblemRevisionSnapshot(restored)),
        editedById: user.id,
        editSummary: `Rolled back to revision ${revision.id}`
      }
    });

    const siblingSlugs: string[] = [];
    for (const sibling of siblingCandidates) {
      const siblingAfter = await problemSnapshotSource(tx, sibling.id);
      siblingSlugs.push(siblingAfter.slug);
      await tx.pageRevision.create({
        data: {
          pageType: SourceType.PROBLEM,
          pageId: siblingAfter.id,
          markdown: siblingAfter.bodyMarkdown,
          problemVersion: siblingAfter.version,
          problemSnapshot: problemRevisionSnapshotJson(buildProblemRevisionSnapshot(siblingAfter)),
          editedById: user.id,
          editSummary: `Shared settings restored from ${restored.language} translation`
        }
      });
    }

    return { restored, siblingSlugs };
  });

  revalidatePath(`/problems/${problem.restored.slug}`);
  revalidatePath(`/problems/${problem.restored.slug}/edit`);
  revalidatePath(`/problems/${problem.restored.slug}/history`);
  for (const siblingSlug of problem.siblingSlugs) {
    revalidatePath(`/problems/${siblingSlug}`);
    revalidatePath(`/problems/${siblingSlug}/edit`);
    revalidatePath(`/problems/${siblingSlug}/history`);
  }
  redirect(contentLanguageViewHref("/problems", problem.restored.slug, problem.restored.language) as Route);
}

export async function startAttemptAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`attempt:start:${user.id}`, 60, 60_000);
  const now = new Date();
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, title: true, translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });

  const translationIds = translations.map((translation) => translation.id);
  const existingAttempt = await prisma.problemAttempt.findFirst({
    where: {
      userId: user.id,
      problemId: { in: translationIds }
    },
    select: { id: true }
  });

  const createdAttempts = await prisma.problemAttempt.createMany({
    data: translations.map((translation) => ({
      userId: user.id,
      problemId: translation.id,
      startedAt: now,
      discussionUnlockAt: unlockDate(now)
    })),
    skipDuplicates: true
  });

  if (!existingAttempt && createdAttempts.count > 0 && problem.authorId !== user.id) {
    const previousNotification = await prisma.notification.findFirst({
      where: {
        userId: problem.authorId,
        actorId: user.id,
        type: NotificationType.PROBLEM_ATTEMPTED,
        href: { in: translations.map((translation) => `/problems/${translation.slug}`) }
      },
      select: { id: true }
    });

    if (!previousNotification) {
      await createNotification({
        userId: problem.authorId,
        actorId: user.id,
        type: NotificationType.PROBLEM_ATTEMPTED,
        title: "Someone is working on your problem",
        body: `${displayNameForUser(user)} started working on "${problem.title}".`,
        href: `/problems/${problemSlug}`
      });
    }
  }

  revalidatePath("/problems");
  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/me");
}

export async function unmarkProblemAttemptAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`attempt:remove:${user.id}`, 60, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });

  await prisma.problemAttempt.deleteMany({
    where: {
      userId: user.id,
      problemId: { in: translations.map((translation) => translation.id) },
      status: AttemptStatus.STARTED
    }
  });

  revalidatePath("/problems");
  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/me");
}

async function markSolvedNow(problemId: number, problemSlug: string, user: { id: number; username: string; displayName?: string | null }) {
  const now = new Date();
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, title: true, translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });
  const translationIds = translations.map((translation) => translation.id);
  const wasAlreadySolved = Boolean(
    await prisma.problemAttempt.findFirst({
      where: { userId: user.id, problemId: { in: translationIds }, status: "SOLVED" },
      select: { id: true }
    })
  );

  await prisma.$transaction(async (tx) => {
    await tx.problemAttempt.createMany({
      data: translationIds.map((translationProblemId) => ({
        userId: user.id,
        problemId: translationProblemId,
        startedAt: now,
        discussionUnlockAt: unlockDate(now),
        status: "SOLVED" as const,
        solvedAt: now
      })),
      skipDuplicates: true
    });
    await tx.problemAttempt.updateMany({
      where: {
        userId: user.id,
        problemId: { in: translationIds },
        status: { not: "SOLVED" }
      },
      data: { status: "SOLVED", solvedAt: now }
    });
    await tx.problemAttempt.updateMany({
      where: {
        userId: user.id,
        problemId: { in: translationIds },
        status: "SOLVED",
        solvedAt: null
      },
      data: { solvedAt: now }
    });
    await tx.problemRecommendationExposure.deleteMany({
      where: { userId: user.id, translationGroupId: problem.translationGroupId }
    });
  });

  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/problems");
  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/me");
  if (problem.authorId !== user.id && !wasAlreadySolved) {
    await createNotification({
      userId: problem.authorId,
      actorId: user.id,
      type: NotificationType.PROBLEM_SOLVED,
      title: "Your problem was solved",
      body: `${displayNameForUser(user)} solved "${problem.title}".`,
      href: `/problems/${problemSlug}`
    });
  }
  if (!wasAlreadySolved) {
    await checkSolveAchievements(user.id);
    if (problem && problem.authorId !== user.id) {
      await checkProblemSolvedByOthersAchievements(problem.authorId);
    }
  }
}

export async function markProblemSolvedAction(problemId: number, problemSlug: string, formData?: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:solve:${user.id}`, 30, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      id: true,
      title: true,
      slug: true,
      authorId: true,
      verificationMode: true,
      verificationAnswer: true,
      language: true
    }
  });

  if (!problem) throw new Error("Problem not found.");

  if (problem.authorId === user.id) {
    await markSolvedNow(problemId, problemSlug, user);
    return;
  }

  if (problem.verificationMode === ProblemVerificationMode.SELF_CHECK) {
    const answer = boundedText(formData?.get("verificationAnswer"), CONTENT_LIMITS.mediumText, "Verification answer");
    if (!verificationMatches(problem.verificationAnswer, answer)) {
      redirect(contentLanguageViewHref("/problems", problemSlug, problem.language, { verification: "incorrect" }) as Route);
    }
    await markSolvedNow(problemId, problemSlug, user);
    return;
  }

  if (problem.verificationMode === ProblemVerificationMode.AUTHOR_REVIEW && problem.authorId !== user.id) {
    const answer = boundedText(formData?.get("verificationAnswer"), CONTENT_LIMITS.longNote, "Verification explanation");
    if (!answer) throw new Error("Please explain your answer before requesting review.");

    const request = await prisma.problemVerificationRequest.create({
      data: {
        problemId,
        userId: user.id,
        answer
      }
    });
    await createNotification({
      userId: problem.authorId,
      actorId: user.id,
      type: NotificationType.VERIFICATION_REQUESTED,
      title: "Solution review requested",
      body: `${displayNameForUser(user)} requested verification for "${problem.title}".`,
      href: `/problems/${problem.slug}/verification/${request.id}`
    });
    revalidatePath(`/problems/${problemSlug}`);
    return;
  }

  await markSolvedNow(problemId, problemSlug, user);
}

export async function unmarkProblemSolvedAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`problem:unsolve:${user.id}`, 30, 60_000);

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { translationGroupId: true }
  });
  if (!problem) throw new Error("Problem not found.");
  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });

  await prisma.problemAttempt.updateMany({
    where: {
      userId: user.id,
      problemId: { in: translations.map((translation) => translation.id) },
      status: "SOLVED"
    },
    data: { status: "STARTED", solvedAt: null }
  });

  revalidatePath("/problems");
  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/me");
}

export async function reviewProblemVerificationAction(requestId: number, decision: "APPROVED" | "REJECTED") {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-review:${user.id}`, 30, 60_000);
  const request = await prisma.problemVerificationRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { id: true, username: true } },
      problem: { select: { id: true, slug: true, title: true, authorId: true, translationGroupId: true } }
    }
  });

  if (!request) throw new Error("Verification request not found.");
  if (!canReviewProblemVerification(user, request.problem)) {
    throw new Error("You cannot review this verification request.");
  }
  if (request.status !== "PENDING") {
    revalidatePath(`/problems/${request.problem.slug}`);
    return;
  }
  const translatedProblems = await prisma.problem.findMany({
    where: { translationGroupId: request.problem.translationGroupId },
    select: { id: true, slug: true }
  });
  const translatedProblemIds = translatedProblems.map((problem) => problem.id);

  await prisma.$transaction(async (tx) => {
    await tx.problemVerificationRequest.update({
      where: { id: request.id },
      data: {
        status: decision,
        reviewerId: user.id,
        reviewedAt: new Date()
      }
    });

    if (decision === "APPROVED") {
      const now = new Date();
      await tx.problemAttempt.createMany({
        data: translatedProblemIds.map((translatedProblemId) => ({
          userId: request.userId,
          problemId: translatedProblemId,
          startedAt: now,
          discussionUnlockAt: unlockDate(now),
          status: "SOLVED" as const,
          solvedAt: now
        })),
        skipDuplicates: true
      });
      await tx.problemAttempt.updateMany({
        where: {
          userId: request.userId,
          problemId: { in: translatedProblemIds },
          status: { not: "SOLVED" }
        },
        data: { status: "SOLVED", solvedAt: now }
      });
      await tx.problemAttempt.updateMany({
        where: {
          userId: request.userId,
          problemId: { in: translatedProblemIds },
          status: "SOLVED",
          solvedAt: null
        },
        data: { solvedAt: now }
      });
    }
  });

  if (decision === "APPROVED") {
    await checkSolveAchievements(request.userId);
    if (request.problem.authorId !== request.userId) {
      await checkProblemSolvedByOthersAchievements(request.problem.authorId);
    }
  }

  await createNotification({
    userId: request.userId,
    actorId: user.id,
    type: decision === "APPROVED" ? NotificationType.VERIFICATION_APPROVED : NotificationType.VERIFICATION_REJECTED,
    title: decision === "APPROVED" ? "Solution verified" : "Solution review rejected",
    body:
      decision === "APPROVED"
        ? `Your answer to "${request.problem.title}" was accepted.`
        : `Your answer to "${request.problem.title}" was not accepted yet.`,
    href: `/problems/${request.problem.slug}/verification/${request.id}`
  });

  revalidatePath(`/problems/${request.problem.slug}`);
  for (const translatedProblem of translatedProblems) revalidatePath(`/problems/${translatedProblem.slug}`);
  revalidatePath(`/problems/${request.problem.slug}/verification/${request.id}`);
  revalidatePath(`/profile/${request.user.username}`);
  revalidatePath("/me");
}

export async function createVerificationMessageAction(requestId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-message:${user.id}`, 20, 60_000);
  const bodyMarkdown = requiredBoundedText(
    formData.get("bodyMarkdown"),
    CONTENT_LIMITS.discussionPost,
    "Verification message"
  );
  const request = await prisma.problemVerificationRequest.findUnique({
    where: { id: requestId },
    include: {
      problem: { select: { id: true, slug: true, title: true, authorId: true } },
      user: { select: { id: true, username: true, displayName: true } }
    }
  });

  if (!request || request.problem.slug !== problemSlug) {
    throw new Error("Verification request not found.");
  }
  if (request.status !== "PENDING") {
    throw new Error("This verification request is already closed.");
  }

  if (!canJoinVerificationDiscussion(user, request)) {
    throw new Error("You cannot join this verification discussion.");
  }

  await prisma.problemVerificationMessage.create({
    data: {
      requestId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  const recipientIds = new Set<number>();
  recipientIds.add(request.userId);
  recipientIds.add(request.problem.authorId);
  recipientIds.delete(user.id);

  await Promise.all(
    [...recipientIds].map((recipientId) =>
      createNotification({
        userId: recipientId,
        actorId: user.id,
        type: NotificationType.VERIFICATION_MESSAGE,
        title: "New verification message",
        body: `${displayNameForUser(user)} replied about "${request.problem.title}".`,
        href: `/problems/${request.problem.slug}/verification/${request.id}`
      })
    )
  );

  revalidatePath(`/problems/${request.problem.slug}`);
  revalidatePath(`/problems/${request.problem.slug}/verification/${request.id}`);
}

export async function updateVerificationMessageAction(messageId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-message-edit:${user.id}`, 30, 60_000);
  const bodyMarkdown = requiredBoundedText(
    formData.get("bodyMarkdown"),
    CONTENT_LIMITS.discussionPost,
    "Verification message"
  );
  const message = await prisma.problemVerificationMessage.findUnique({
    where: { id: messageId },
    include: {
      request: {
        include: {
          problem: { select: { id: true, slug: true, title: true, authorId: true } }
        }
      }
    }
  });

  if (!message || message.request.problem.slug !== problemSlug) {
    throw new Error("Verification message not found.");
  }
  if (!canJoinVerificationDiscussion(user, message.request)) {
    throw new Error("You cannot join this verification discussion.");
  }
  if (!canEditVerificationMessage(user, message)) {
    throw new Error("You cannot edit this verification message.");
  }

  await prisma.problemVerificationMessage.update({
    where: { id: message.id },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${message.request.problem.slug}`);
  revalidatePath(`/problems/${message.request.problem.slug}/verification/${message.request.id}`);
}

export async function deleteVerificationMessageAction(messageId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`verification-message-delete:${user.id}`, 30, 60_000);
  const message = await prisma.problemVerificationMessage.findUnique({
    where: { id: messageId },
    include: {
      request: {
        include: {
          problem: { select: { id: true, slug: true, title: true, authorId: true } }
        }
      }
    }
  });

  if (!message || message.request.problem.slug !== problemSlug) {
    throw new Error("Verification message not found.");
  }
  if (!canJoinVerificationDiscussion(user, message.request)) {
    throw new Error("You cannot join this verification discussion.");
  }
  if (!canEditVerificationMessage(user, message)) {
    throw new Error("You cannot delete this verification message.");
  }

  await prisma.problemVerificationMessage.delete({ where: { id: message.id } });

  revalidatePath(`/problems/${message.request.problem.slug}`);
  revalidatePath(`/problems/${message.request.problem.slug}/verification/${message.request.id}`);
}

export async function toggleProblemFavoriteAction(problemId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`favorite:${user.id}`, 60, 60_000);
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { authorId: true, translationGroupId: true }
  });

  if (!problem || problem.authorId === user.id) {
    revalidatePath(`/problems/${problemSlug}`);
    return;
  }

  const translations = await prisma.problem.findMany({
    where: { translationGroupId: problem.translationGroupId },
    select: { id: true, slug: true }
  });
  const translationIds = translations.map((translation) => translation.id);
  const existing = await prisma.problemFavorite.findFirst({
    where: { userId: user.id, problemId: { in: translationIds } },
    select: { problemId: true }
  });

  if (existing) {
    await prisma.problemFavorite.deleteMany({
      where: { userId: user.id, problemId: { in: translationIds } }
    });
  } else {
    await prisma.problemFavorite.createMany({
      data: translationIds.map((translationProblemId) => ({
        userId: user.id,
        problemId: translationProblemId
      })),
      skipDuplicates: true
    });
  }

  for (const translation of translations) revalidatePath(`/problems/${translation.slug}`);
  revalidatePath("/problems");
  revalidatePath("/");
  revalidatePath("/tips");
  revalidatePath("/users");
  revalidatePath(`/profile/${user.username}`);
  revalidatePath(`/profile/${user.username}?view=favorites`);
  revalidatePath("/me");
}

export async function createDiscussionPostAction(
  problemId: number,
  returnToDiscussionOrFormData: boolean | FormData,
  maybeFormData?: FormData
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`post:${user.id}`, 12, 60_000);
  const returnToDiscussion = typeof returnToDiscussionOrFormData === "boolean" ? returnToDiscussionOrFormData : false;
  const formData =
    typeof returnToDiscussionOrFormData === "boolean" ? maybeFormData : returnToDiscussionOrFormData;
  if (!(formData instanceof FormData)) throw new Error("Discussion message is missing.");
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      slug: true,
      title: true,
      authorId: true,
      translationGroupId: true,
      thread: { select: { id: true } }
    }
  });

  if (!problem) throw new Error("Problem not found.");
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Discussion message");
  const typeInput = String(formData.get("type") ?? "COMMENT").toUpperCase();
  const type = Object.values(PostType).includes(typeInput as PostType) ? (typeInput as PostType) : PostType.COMMENT;
  const thread =
    problem.thread ??
    (await prisma.discussionThread.upsert({
      where: { problemId },
      update: {},
      create: { problemId },
      select: { id: true }
    }));
  await prisma.discussionPost.create({
    data: {
      threadId: thread.id,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown),
      type
    }
  });

  revalidatePath("/problems");
  revalidatePath(`/problems/${problem.slug}`);
  revalidatePath(`/problems/${problem.slug}/discussion`);
  if (type === PostType.HINT) {
    await checkHintAchievements(user.id);
  }
  await notifyProblemAuthor({
    problemId,
    actorId: user.id,
    type: NotificationType.DISCUSSION_POSTED,
    title: "New discussion message",
    body: `${displayNameForUser(user)} posted in the discussion of "${problem.title}".`,
    href: `/problems/${problem.slug}/discussion`
  });
  redirect(returnToDiscussion ? (`/problems/${problem.slug}/discussion` as Route) : `/problems/${problem.slug}`);
}

export async function updateHintAction(
  postId: number,
  problemSlug: string,
  returnToDiscussionOrFormData: boolean | FormData,
  maybeFormData?: FormData
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`hint:update:${user.id}`, 30, 60_000);
  const returnToDiscussion = typeof returnToDiscussionOrFormData === "boolean" ? returnToDiscussionOrFormData : false;
  const formData =
    typeof returnToDiscussionOrFormData === "boolean" ? maybeFormData : returnToDiscussionOrFormData;
  if (!(formData instanceof FormData)) throw new Error("Hint content is missing.");
  const hint = await prisma.discussionPost.findFirst({
    where: {
      id: postId,
      type: PostType.HINT,
      deletedAt: null,
      thread: { problem: { slug: problemSlug } }
    },
    select: { id: true, authorId: true }
  });

  if (!hint) throw new Error("Hint not found.");
  if (!canEditDiscussionHint(user, hint)) {
    throw new Error("You cannot edit this hint.");
  }

  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Hint");
  await prisma.discussionPost.update({
    where: { id: hint.id },
    data: {
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/discussion`);
  redirect(returnToDiscussion ? (`/problems/${problemSlug}/discussion` as Route) : `/problems/${problemSlug}`);
}

export async function deleteHintAction(postId: number, problemSlug: string, returnToDiscussion = false) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`hint:delete:${user.id}`, 30, 60_000);
  const hint = await prisma.discussionPost.findFirst({
    where: {
      id: postId,
      type: PostType.HINT,
      deletedAt: null,
      thread: { problem: { slug: problemSlug } }
    },
    select: { id: true, authorId: true }
  });

  if (!hint) throw new Error("Hint not found.");
  if (!canEditDiscussionHint(user, hint)) {
    throw new Error("You cannot delete this hint.");
  }

  await prisma.discussionPost.update({
    where: { id: hint.id },
    data: { deletedAt: new Date() }
  });

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/discussion`);
  redirect(returnToDiscussion ? (`/problems/${problemSlug}/discussion` as Route) : `/problems/${problemSlug}`);
}

export async function votePostAction(postId: number, problemSlug: string, returnToDiscussion = false) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);
  const key = {
    userId: user.id,
    targetType: TargetType.POST,
    targetId: postId
  };
  const existing = await prisma.vote.findUnique({
    where: { userId_targetType_targetId: key }
  });

  let voteAdded = false;
  if (existing) {
    await prisma.vote.delete({ where: { userId_targetType_targetId: key } });
  } else {
    await prisma.vote.create({ data: { ...key, voteType: VoteType.UP } });
    voteAdded = true;
  }

  if (voteAdded) {
    const post = await prisma.discussionPost.findUnique({
      where: { id: postId },
      select: { authorId: true }
    });
    if (post) {
      await checkUsefulPostAchievements(post.authorId);
    }
  }

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/discussion`);
  if (returnToDiscussion) redirect(`/problems/${problemSlug}/discussion` as Route);
}

export async function voteProblemAction(problemId: number) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);
  const key = {
    userId: user.id,
    targetType: TargetType.PROBLEM,
    targetId: problemId
  };
  const existing = await prisma.vote.findUnique({
    where: { userId_targetType_targetId: key }
  });

  if (existing) {
    await prisma.vote.delete({ where: { userId_targetType_targetId: key } });
  } else {
    await prisma.vote.create({ data: { ...key, voteType: VoteType.UP } });
  }

  revalidatePath("/problems");
}
