"use server";

import { ConceptStatus, ProblemStatus, QualityStatus, ReportStatus, TargetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireModerator, requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

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

export async function dismissReportAction(reportId: number) {
  await requireModerator();

  await prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.DISMISSED }
  });

  revalidatePath("/moderation");
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
