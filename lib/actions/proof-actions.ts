"use server";

import type { Route } from "next";
import { NotificationType, SourceType, TargetType, VoteType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkHintAchievements, checkProofAchievements } from "@/lib/achievements";
import { requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import {
  assertTranslationWikiLinksPreserved,
  syncInternalLinks,
  TranslationWikiLinksPreservedError
} from "@/lib/internal-links";
import { createNotification, notifyProblemAuthor } from "@/lib/notifications";
import { canDeleteSolution, canEditSolution } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { contentLanguageViewHref } from "@/lib/translation-routing";
import { acquireTransactionLock } from "@/lib/transaction-lock";
import { displayNameForUser } from "@/lib/user-display";
import { editableContentLanguage, requireActiveContentLanguage } from "@/lib/languages";

async function renderMarkdownContent(markdown: string) {
  const { renderMarkdown } = await import("@/lib/markdown");
  return renderMarkdown(markdown);
}

export async function createProofAction(problemId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof:${user.id}`, 6, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Solution");
  const language = requireActiveContentLanguage(formData.get("language"));
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { slug: true, language: true }
  });
  if (!problem || problem.slug !== problemSlug) {
    throw new Error("Problem not found.");
  }

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  await prisma.$transaction(async (tx) => {
    const proof = await tx.problemProof.create({
      data: {
        problemId,
        authorId: user.id,
        language,
        bodyMarkdown,
        bodyHtml
      }
    });
    await syncInternalLinks(SourceType.PROOF, proof.id, bodyMarkdown, tx, language);
  });

  revalidatePath(`/problems/${problemSlug}`);
  await checkProofAchievements(user.id);
  await notifyProblemAuthor({
    problemId,
    actorId: user.id,
    type: NotificationType.PROOF_ADDED,
    title: "New solution on your problem",
    body: `${displayNameForUser(user)} added a solution.`,
    href: `/problems/${problemSlug}`
  });
  redirect(contentLanguageViewHref("/problems", problemSlug, problem.language) as Route);
}

export async function translateProofAction(
  problemId: number,
  problemSlug: string,
  sourceProofId: number,
  formData: FormData
) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof:translate:${user.id}`, 6, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Solution");

  const [problem, sourceProof] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, slug: true, title: true, language: true, translationGroupId: true }
    }),
    prisma.problemProof.findUnique({
      where: { id: sourceProofId },
      select: {
        id: true,
        problemId: true,
        authorId: true,
        language: true,
        translationGroupId: true,
        bodyMarkdown: true,
        createdAt: true,
        problem: { select: { translationGroupId: true } }
      }
    })
  ]);
  if (!problem || problem.slug !== problemSlug) throw new Error("Problem not found.");
  if (
    !sourceProof
    || sourceProof.problemId === problem.id
    || sourceProof.language === problem.language
    || sourceProof.problem.translationGroupId !== problem.translationGroupId
  ) {
    throw new Error("Source solution not found.");
  }

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  let translatedProof;
  try {
    translatedProof = await prisma.$transaction(async (tx) => {
      await acquireTransactionLock(tx, `proof-translation:${sourceProof.translationGroupId}:${problem.id}`);
      const existingTranslation = await tx.problemProof.findUnique({
        where: {
          translationGroupId_problemId: {
            translationGroupId: sourceProof.translationGroupId,
            problemId: problem.id
          }
        },
        select: { id: true }
      });
      if (existingTranslation) throw new Error("This solution has already been translated for this problem.");

      await assertTranslationWikiLinksPreserved(
        sourceProof.bodyMarkdown,
        bodyMarkdown,
        sourceProof.language,
        problem.language,
        tx
      );
      const created = await tx.problemProof.create({
        data: {
          translationGroupId: sourceProof.translationGroupId,
          problemId: problem.id,
          authorId: sourceProof.authorId,
          translatedFromProofId: sourceProof.id,
          translatedById: sourceProof.authorId === user.id ? null : user.id,
          language: problem.language,
          bodyMarkdown,
          bodyHtml,
          createdAt: sourceProof.createdAt
        }
      });
      await syncInternalLinks(SourceType.PROOF, created.id, bodyMarkdown, tx, problem.language);
      return created;
    });
  } catch (error) {
    if (error instanceof TranslationWikiLinksPreservedError) {
      const returnHref = contentLanguageViewHref("/problems", problem.slug, problem.language);
      const separator = returnHref.includes("?") ? "&" : "?";
      redirect(
        `${returnHref}${separator}translateSolution=${sourceProof.id}&solutionTranslationError=links#translate-solution` as Route
      );
    }
    throw error;
  }

  if (sourceProof.authorId !== user.id) {
    await createNotification({
      userId: sourceProof.authorId,
      actorId: user.id,
      type: NotificationType.PROOF_ADDED,
      title: "Your solution was translated",
      body: `${displayNameForUser(user)} translated your solution to "${problem.title}".`,
      href: `/problems/${problem.slug}#solution-${translatedProof.id}`
    });
  }

  revalidatePath(`/problems/${problem.slug}`);
  revalidatePath("/users");
  revalidatePath(`/profile/${user.profileSlug}`);
  redirect(contentLanguageViewHref("/problems", problem.slug, problem.language) as Route);
}

export type SolutionHintActionState = {
  error: "required" | "too-long" | null;
};

export async function saveSolutionHintAction(
  problemId: number,
  proofId: number,
  _state: SolutionHintActionState,
  formData: FormData
): Promise<SolutionHintActionState> {
  const submittedBody = formData.get("bodyMarkdown");
  const bodyMarkdown = typeof submittedBody === "string" ? submittedBody.trim() : "";
  if (!bodyMarkdown) return { error: "required" };
  if (bodyMarkdown.length > CONTENT_LIMITS.discussionPost) return { error: "too-long" };

  const user = await requireVerifiedUser();
  await assertRateLimit(`solution-hint:${user.id}`, 12, 60_000);
  const bodyHtml = await renderMarkdownContent(bodyMarkdown);

  const problem = await prisma.$transaction(async (tx) => {
    await acquireTransactionLock(tx, `solution-hint:${proofId}`);
    const proof = await tx.problemProof.findFirst({
      where: {
        id: proofId,
        problemId,
        OR: [{ authorId: user.id }, { translatedById: user.id }]
      },
      select: {
        id: true,
        problem: { select: { id: true, slug: true, language: true, translationGroupId: true } }
      }
    });
    if (!proof) throw new Error("Solution not found.");

    const solvedAttempt = await tx.problemAttempt.findFirst({
      where: {
        userId: user.id,
        status: "SOLVED",
        problem: { translationGroupId: proof.problem.translationGroupId }
      },
      select: { id: true }
    });
    if (!solvedAttempt) throw new Error("Solve this problem before adding a hint for your solution.");

    const existingHint = await tx.problemHint.findUnique({ where: { proofId: proof.id } });
    if (existingHint) {
      if (existingHint.authorId !== user.id && existingHint.translatedById !== user.id) {
        throw new Error("You cannot edit this hint.");
      }
      await tx.problemHint.update({
        where: { id: existingHint.id },
        data: { bodyMarkdown, bodyHtml }
      });
    } else {
      const lastHint = await tx.problemHint.findFirst({
        where: { problemId: proof.problem.id },
        orderBy: { position: "desc" },
        select: { position: true }
      });
      await tx.problemHint.create({
        data: {
          problemId: proof.problem.id,
          proofId: proof.id,
          authorId: user.id,
          bodyMarkdown,
          bodyHtml,
          position: (lastHint?.position ?? -1) + 1
        }
      });
    }
    return proof.problem;
  });

  await checkHintAchievements(user.id);
  revalidatePath(`/problems/${problem.slug}`);
  const problemHref = contentLanguageViewHref("/problems", problem.slug, problem.language);
  const separator = problemHref.includes("?") ? "&" : "?";
  redirect(`${problemHref}${separator}hint=saved#solution-hint` as Route);
}

export async function updateProofAction(proofId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof:update:${user.id}`, 20, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Solution");

  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: { authorId: true, translatedById: true, language: true, problem: { select: { slug: true, language: true } } }
  });
  if (!proof || proof.problem.slug !== problemSlug) {
    throw new Error("Solution not found.");
  }
  if (!canEditSolution(user, proof)) {
    throw new Error("You cannot edit this solution.");
  }
  const language = editableContentLanguage(formData.get("language"), proof.language);

  const bodyHtml = await renderMarkdownContent(bodyMarkdown);
  await prisma.$transaction(async (tx) => {
    await tx.problemProof.update({
      where: { id: proofId },
      data: { bodyMarkdown, bodyHtml, language }
    });
    await syncInternalLinks(SourceType.PROOF, proofId, bodyMarkdown, tx, language);
  });

  revalidatePath(`/problems/${problemSlug}`);
  redirect(contentLanguageViewHref("/problems", problemSlug, proof.problem.language) as Route);
}

export async function deleteProofAction(proofId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof:delete:${user.id}`, 10, 60_000);

  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: { authorId: true, translatedById: true, problem: { select: { slug: true, language: true } } }
  });
  if (!proof || proof.problem.slug !== problemSlug) {
    throw new Error("Solution not found.");
  }
  if (!canDeleteSolution(user, proof)) {
    throw new Error("You cannot delete this solution.");
  }

  await prisma.$transaction([
    prisma.vote.deleteMany({ where: { targetType: TargetType.PROOF, targetId: proofId } }),
    prisma.internalLink.deleteMany({ where: { sourceType: SourceType.PROOF, sourceId: proofId } }),
    prisma.problemProof.delete({ where: { id: proofId } })
  ]);

  revalidatePath(`/problems/${problemSlug}`);
  redirect(contentLanguageViewHref("/problems", problemSlug, proof.problem.language) as Route);
}

export async function voteProofAction(proofId: number, problemSlug: string) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`vote:${user.id}`, 120, 60_000);
  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: { authorId: true, translatedById: true, problem: { select: { slug: true, title: true } } }
  });
  if (!proof || proof.problem.slug !== problemSlug) {
    throw new Error("Solution not found.");
  }
  if (proof.authorId === user.id || proof.translatedById === user.id) {
    revalidatePath(`/problems/${problemSlug}`);
    return;
  }

  const key = {
    userId: user.id,
    targetType: TargetType.PROOF,
    targetId: proofId
  };
  const existing = await prisma.vote.findUnique({
    where: { userId_targetType_targetId: key }
  });

  if (existing) {
    await prisma.vote.delete({ where: { userId_targetType_targetId: key } });
  } else {
    await prisma.vote.create({ data: { ...key, voteType: VoteType.UP } });
    await createNotification({
      userId: proof.authorId,
      actorId: user.id,
      type: NotificationType.SOLUTION_VOTED,
      title: "Your solution received a useful vote",
      body: `${displayNameForUser(user)} marked your solution to "${proof.problem.title}" as useful.`,
      href: `/problems/${problemSlug}`
    });
  }

  revalidatePath(`/problems/${problemSlug}`);
}

export async function createProofCommentAction(proofId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`proof-comment:${user.id}`, 12, 60_000);
  const bodyMarkdown = requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.discussionPost, "Comment");
  const language = requireActiveContentLanguage(formData.get("language"));
  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: {
      authorId: true,
      translatedById: true,
      problem: { select: { slug: true, title: true } }
    }
  });
  if (!proof || proof.problem.slug !== problemSlug) {
    throw new Error("Solution not found.");
  }

  const comment = await prisma.proofComment.create({
    data: {
      proofId,
      authorId: user.id,
      language,
      bodyMarkdown,
      bodyHtml: await renderMarkdownContent(bodyMarkdown)
    }
  });

  const discussionHref = `/problems/${problemSlug}/proofs/${proofId}/discussion`;
  const recipientIds = [...new Set([proof.authorId, proof.translatedById])].filter(
    (recipientId): recipientId is number => recipientId !== null && recipientId !== user.id
  );
  await Promise.all(
    recipientIds.map((userId) =>
      createNotification({
        userId,
        actorId: user.id,
        type: NotificationType.DISCUSSION_POSTED,
        title: "New message about your solution",
        body: `${displayNameForUser(user)} commented on your solution to "${proof.problem.title}".`,
        href: `${discussionHref}#comment-${comment.id}`
      })
    )
  );

  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(discussionHref);
  redirect(`${discussionHref}#comment-${comment.id}` as Route);
}
