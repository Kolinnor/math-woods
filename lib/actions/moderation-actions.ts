"use server";

import type { Route } from "next";
import { ConceptStatus, NotificationType, ProblemStatus, QualityStatus, ReportStatus, TargetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModerator, requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { parseSolutionReportCategory, solutionReportCategoryLabel } from "@/lib/solution-reports";
import { acquireTransactionLock } from "@/lib/transaction-lock";
import { displayNameForUser } from "@/lib/user-display";

export async function reportProblemAction(problemId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  const reason = requiredBoundedText(formData.get("reason"), CONTENT_LIMITS.longNote, "Report reason");
  await assertRateLimit(`report:${user.id}`, 10, 60_000);

  await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType: TargetType.PROBLEM,
      targetId: problemId,
      reason
    }
  });

  revalidatePath("/moderation");
  revalidatePath("/problems");
}

export async function reportConceptAction(conceptId: number, formData: FormData) {
  const user = await requireVerifiedUser();
  const reason = requiredBoundedText(formData.get("reason"), CONTENT_LIMITS.longNote, "Report reason");
  await assertRateLimit(`report:${user.id}`, 10, 60_000);

  await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType: TargetType.CONCEPT,
      targetId: conceptId,
      reason
    }
  });

  revalidatePath("/moderation");
  revalidatePath("/concepts");
}

export async function reportPostAction(postId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  const reason = requiredBoundedText(formData.get("reason"), CONTENT_LIMITS.longNote, "Report reason");
  await assertRateLimit(`report:${user.id}`, 10, 60_000);

  await prisma.report.create({
    data: {
      reporterId: user.id,
      targetType: TargetType.POST,
      targetId: postId,
      reason
    }
  });

  revalidatePath("/moderation");
  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/discussion`);
}

export async function reportProofAction(proofId: number, problemSlug: string, formData: FormData) {
  const user = await requireVerifiedUser();
  const category = parseSolutionReportCategory(formData.get("category"));
  const reason = requiredBoundedText(formData.get("reason"), CONTENT_LIMITS.longNote, "Explanation");
  await assertRateLimit(`proof-report:${user.id}`, 8, 60_000);

  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: {
      id: true,
      authorId: true,
      translatedById: true,
      problem: { select: { slug: true, title: true } }
    }
  });
  if (!proof || proof.problem.slug !== problemSlug) throw new Error("Solution not found.");
  if (proof.authorId === user.id || proof.translatedById === user.id) {
    throw new Error("You cannot report your own solution.");
  }

  const created = await prisma.$transaction(async (tx) => {
    await acquireTransactionLock(tx, `proof-report:${user.id}:${proofId}`);
    const existing = await tx.report.findFirst({
      where: {
        reporterId: user.id,
        targetType: TargetType.PROOF,
        targetId: proofId,
        status: ReportStatus.OPEN
      },
      select: { id: true }
    });

    if (existing) {
      await tx.report.update({ where: { id: existing.id }, data: { category, reason } });
      return false;
    }

    await tx.report.create({
      data: {
        reporterId: user.id,
        targetType: TargetType.PROOF,
        targetId: proofId,
        category,
        reason
      }
    });
    return true;
  });

  if (created) {
    const recipientIds = [...new Set([proof.authorId, proof.translatedById].filter((id): id is number => id !== null))];
    await Promise.all(
      recipientIds.map((userId) =>
        createNotification({
          userId,
          actorId: user.id,
          type: NotificationType.SOLUTION_REPORTED,
          title: "Potential issue reported on your solution",
          body: `${displayNameForUser(user)} reported a ${solutionReportCategoryLabel(category)} on your solution to \"${proof.problem.title}\".`,
          href: `/problems/${problemSlug}/proofs/${proofId}/discussion#report-solution`
        })
      )
    );
  }

  revalidatePath("/moderation");
  revalidatePath(`/problems/${problemSlug}`);
  revalidatePath(`/problems/${problemSlug}/proofs/${proofId}/discussion`);
  redirect(`/problems/${problemSlug}/proofs/${proofId}/discussion?report=saved#report-solution` as Route);
}

export async function dismissReportAction(reportId: number) {
  const moderator = await requireModerator();
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { reporterId: true, targetType: true, targetId: true }
  });
  if (!report) throw new Error("Report not found.");

  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: ReportStatus.DISMISSED,
      reviewerId: moderator.id,
      resolvedAt: new Date()
    }
  });

  if (report.targetType === TargetType.PROOF) {
    const proof = await prisma.problemProof.findUnique({
      where: { id: report.targetId },
      select: { problem: { select: { slug: true, title: true } } }
    });
    if (proof) {
      await createNotification({
        userId: report.reporterId,
        actorId: moderator.id,
        type: NotificationType.SOLUTION_REPORTED,
        title: "Your solution report was reviewed",
        body: `${displayNameForUser(moderator)} reviewed and dismissed your report on \"${proof.problem.title}\".`,
        href: `/problems/${proof.problem.slug}/proofs/${report.targetId}/discussion#report-solution`
      });
    }
  }

  revalidatePath("/moderation");
}

export async function resolveReportedProofAction(reportId: number, proofId: number) {
  const moderator = await requireModerator();
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      targetType: TargetType.PROOF,
      targetId: proofId,
      status: ReportStatus.OPEN
    },
    select: { reporterId: true }
  });
  if (!report) throw new Error("Open solution report not found.");

  const proof = await prisma.problemProof.findUnique({
    where: { id: proofId },
    select: { problem: { select: { slug: true, title: true } } }
  });
  if (!proof) throw new Error("Solution not found.");

  await prisma.report.update({
    where: { id: reportId },
    data: {
      status: ReportStatus.ACTION_TAKEN,
      reviewerId: moderator.id,
      resolvedAt: new Date()
    }
  });
  await createNotification({
    userId: report.reporterId,
    actorId: moderator.id,
    type: NotificationType.SOLUTION_REPORTED,
    title: "Your solution report was addressed",
    body: `${displayNameForUser(moderator)} marked your report on \"${proof.problem.title}\" as addressed.`,
    href: `/problems/${proof.problem.slug}/proofs/${proofId}/discussion#report-solution`
  });

  revalidatePath("/moderation");
  revalidatePath(`/problems/${proof.problem.slug}`);
  revalidatePath(`/problems/${proof.problem.slug}/proofs/${proofId}/discussion`);
}

export async function hideReportedProblemAction(reportId: number, problemId: number) {
  await requireModerator();

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: { status: ProblemStatus.FLAGGED }
    }),
    prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.ACTION_TAKEN }
    })
  ]);

  revalidatePath("/moderation");
  revalidatePath("/problems");
}

export async function markReportedProblemNeedsWorkAction(reportId: number, problemId: number) {
  await requireModerator();

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: { qualityStatus: QualityStatus.NEEDS_WORK }
    }),
    prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.ACTION_TAKEN }
    })
  ]);

  revalidatePath("/moderation");
  revalidatePath("/problems");
}

export async function publishProblemAction(problemId: number) {
  await requireModerator();

  await prisma.problem.update({
    where: { id: problemId },
    data: { status: ProblemStatus.PUBLISHED }
  });

  revalidatePath("/moderation");
  revalidatePath("/problems");
}

export async function markReportedConceptControversialAction(reportId: number, conceptId: number) {
  await requireModerator();

  await prisma.$transaction([
    prisma.concept.update({
      where: { id: conceptId },
      data: { status: ConceptStatus.CONTROVERSIAL }
    }),
    prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.ACTION_TAKEN }
    })
  ]);

  revalidatePath("/moderation");
  revalidatePath("/concepts");
}

export async function markConceptUsableAction(conceptId: number) {
  await requireModerator();

  await prisma.concept.update({
    where: { id: conceptId },
    data: { status: ConceptStatus.USABLE }
  });

  revalidatePath("/moderation");
  revalidatePath("/concepts");
}

export async function hideReportedPostAction(reportId: number, postId: number) {
  await requireModerator();

  await prisma.$transaction([
    prisma.discussionPost.update({
      where: { id: postId },
      data: { deletedAt: new Date() }
    }),
    prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.ACTION_TAKEN }
    })
  ]);

  revalidatePath("/moderation");
  revalidatePath("/problems");
}
