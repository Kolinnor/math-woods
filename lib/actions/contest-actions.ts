"use server";

import { ContestPlacement, NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { dailyProblemDateKey, isDailyProblemDateKey } from "@/lib/daily-problem-schedule";
import { canUseAdminTools } from "@/lib/permissions";
import { createNotification } from "@/lib/notifications";
import {
  contestCreationWindow,
  contestEndDateKey,
  contestIsOpen,
  isSaturdayDateKey
} from "@/lib/problem-contests";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { normalizeTipImagePosition, normalizeTipImageUrl } from "@/lib/tip-images";

async function availableContestSlug(title: string, startDateKey: string, ignoredId?: number) {
  const base = ensureSlug(`${startDateKey}-${title}`, `contest-${startDateKey}`);
  let slug = base;
  let suffix = 2;
  while (await prisma.problemContest.findFirst({
    where: { slug, ...(ignoredId ? { id: { not: ignoredId } } : {}) },
    select: { id: true }
  })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

async function contestNotificationRecipients(excludedUserId?: number) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      emailVerifiedAt: { not: null },
      ...(excludedUserId ? { id: { not: excludedUserId } } : {}),
      notificationPreferences: {
        none: { type: NotificationType.CONTEST_UPDATE, enabled: false }
      }
    },
    select: { id: true }
  });
}

export async function saveContestAction(formData: FormData) {
  const user = await requireVerifiedUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit contests.");
  await assertRateLimit(`contest:save:${user.id}`, 20, 60_000);

  const contestId = Number(formData.get("contestId"));
  const editingId = Number.isInteger(contestId) && contestId > 0 ? contestId : undefined;
  const startDateKey = String(formData.get("startDateKey") ?? "");
  if (!isDailyProblemDateKey(startDateKey) || !isSaturdayDateKey(startDateKey)) {
    throw new Error("A contest must begin on a Saturday.");
  }
  const titleEn = requiredBoundedText(formData.get("titleEn"), CONTENT_LIMITS.title, "English title");
  const titleFr = requiredBoundedText(formData.get("titleFr"), CONTENT_LIMITS.title, "French title");
  const data = {
    startDateKey,
    endDateKey: contestEndDateKey(startDateKey),
    titleEn,
    titleFr,
    summaryEn: requiredBoundedText(formData.get("summaryEn"), CONTENT_LIMITS.mediumText, "English summary"),
    summaryFr: requiredBoundedText(formData.get("summaryFr"), CONTENT_LIMITS.mediumText, "French summary"),
    bodyEn: boundedText(formData.get("bodyEn"), CONTENT_LIMITS.markdown, "English description"),
    bodyFr: boundedText(formData.get("bodyFr"), CONTENT_LIMITS.markdown, "French description"),
    rulesEn: boundedText(formData.get("rulesEn"), CONTENT_LIMITS.longNote, "English rules"),
    rulesFr: boundedText(formData.get("rulesFr"), CONTENT_LIMITS.longNote, "French rules"),
    criteriaEn: boundedText(formData.get("criteriaEn"), CONTENT_LIMITS.longNote, "English criteria"),
    criteriaFr: boundedText(formData.get("criteriaFr"), CONTENT_LIMITS.longNote, "French criteria"),
    imageUrl: normalizeTipImageUrl(formData.get("imageUrl")),
    imagePositionX: normalizeTipImagePosition(formData.get("imagePositionX")),
    imagePositionY: normalizeTipImagePosition(formData.get("imagePositionY")),
    rewardPoints: Math.max(0, Math.min(10_000, Math.floor(Number(formData.get("rewardPoints")) || 300)))
  };
  const publish = formData.get("published") === "on";
  const slug = await availableContestSlug(titleEn, startDateKey, editingId);

  const saved = await prisma.$transaction(async (tx) => {
    const existing = editingId
      ? await tx.problemContest.findUnique({
          where: { id: editingId },
          select: { publishedAt: true, launchNotificationSentAt: true }
        })
      : null;
    if (editingId && !existing) throw new Error("Contest not found.");
    return editingId
      ? await tx.problemContest.update({
          where: { id: editingId },
          data: { ...data, slug, publishedAt: publish ? existing?.publishedAt ?? new Date() : null }
        })
      : await tx.problemContest.create({
          data: { ...data, slug, createdById: user.id, publishedAt: publish ? new Date() : null }
        });
  });

  await maybeSendContestLifecycleNotifications(saved.id);

  revalidatePath("/");
  revalidatePath("/contest");
  revalidatePath("/contest/edit");
  redirect(`/contest/edit?id=${saved.id}&saved=1`);
}

export async function submitContestProblemAction(formData: FormData) {
  const user = await requireVerifiedUser();
  await assertRateLimit(`contest:submit:${user.id}`, 10, 60_000);
  const contestId = Number(formData.get("contestId"));
  const problemId = Number(formData.get("problemId"));
  if (!Number.isInteger(contestId) || !Number.isInteger(problemId)) throw new Error("Invalid contest submission.");

  await prisma.$transaction(async (tx) => {
    const contest = await tx.problemContest.findUnique({ where: { id: contestId } });
    if (!contest || !contestIsOpen(contest)) throw new Error("This contest is not accepting submissions.");
    const problem = await tx.problem.findFirst({
      where: {
        id: problemId,
        authorId: user.id,
        status: "PUBLISHED",
        translatedFromProblemId: null,
        createdAt: contestCreationWindow(contest)
      },
      select: { id: true, translationGroupId: true }
    });
    if (!problem) throw new Error("Choose an original problem created during this contest week.");
    await tx.problemContestSubmission.upsert({
      where: { contestId_userId: { contestId, userId: user.id } },
      create: { contestId, userId: user.id, problemId: problem.id, translationGroupId: problem.translationGroupId },
      update: { problemId: problem.id, translationGroupId: problem.translationGroupId, placement: null }
    });
  });
  revalidatePath("/contest");
  redirect("/contest?submitted=1");
}

export async function withdrawContestSubmissionAction(formData: FormData) {
  const user = await requireVerifiedUser();
  const contestId = Number(formData.get("contestId"));
  const contest = await prisma.problemContest.findUnique({ where: { id: contestId } });
  if (!contest || !contestIsOpen(contest)) throw new Error("This submission can no longer be withdrawn.");
  await prisma.problemContestSubmission.deleteMany({ where: { contestId, userId: user.id } });
  revalidatePath("/contest");
}

export async function publishContestResultsAction(formData: FormData) {
  const user = await requireVerifiedUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can publish contest results.");
  const contestId = Number(formData.get("contestId"));
  const winnerId = Number(formData.get("winnerSubmissionId"));
  const honorableIds = new Set(formData.getAll("honorableSubmissionIds").map(Number).filter(Number.isInteger));
  if (!Number.isInteger(contestId) || !Number.isInteger(winnerId)) throw new Error("Choose one winner.");
  honorableIds.delete(winnerId);

  const result = await prisma.$transaction(async (tx) => {
    const contest = await tx.problemContest.findUnique({
      where: { id: contestId },
      include: { submissions: { select: { id: true, userId: true, placement: true } } }
    });
    if (!contest) throw new Error("Contest not found.");
    const submissionIds = new Set(contest.submissions.map(({ id }) => id));
    if (!submissionIds.has(winnerId) || [...honorableIds].some((id) => !submissionIds.has(id))) {
      throw new Error("A selected result does not belong to this contest.");
    }
    await tx.problemContestSubmission.updateMany({ where: { contestId }, data: { placement: null } });
    await tx.problemContestSubmission.update({ where: { id: winnerId }, data: { placement: ContestPlacement.WINNER } });
    if (honorableIds.size) {
      await tx.problemContestSubmission.updateMany({
        where: { id: { in: [...honorableIds] }, contestId },
        data: { placement: ContestPlacement.HONORABLE_MENTION }
      });
    }
    await tx.problemContest.update({ where: { id: contestId }, data: { resultsPublishedAt: new Date() } });
    return contest.submissions.filter((submission) => {
      const nextPlacement = submission.id === winnerId
        ? ContestPlacement.WINNER
        : honorableIds.has(submission.id)
          ? ContestPlacement.HONORABLE_MENTION
          : null;
      return nextPlacement !== null && (contest.resultsPublishedAt === null || submission.placement !== nextPlacement);
    });
  });

  if (result.length) {
    await Promise.all(result.map((submission) =>
      createNotification({
        userId: submission.userId,
        actorId: user.id,
        type: NotificationType.CONTEST_UPDATE,
        title: submission.id === winnerId ? "You won the weekly contest" : "Your problem received an honorable mention",
        body: submission.id === winnerId ? "Your problem earned the weekly contest prize." : "The admins highlighted your contest entry.",
        href: "/contest"
      })
    ));
  }
  revalidatePath("/");
  revalidatePath("/contest");
  revalidatePath("/users");
  redirect(`/contest/edit?id=${contestId}&results=1`);
}

export async function maybeSendContestLifecycleNotifications(contestId: number) {
  const today = dailyProblemDateKey();
  const launchClaim = await prisma.problemContest.updateMany({
    where: {
      id: contestId,
      publishedAt: { not: null },
      startDateKey: { lte: today },
      endDateKey: { gte: today },
      launchNotificationSentAt: null
    },
    data: { launchNotificationSentAt: new Date() }
  });
  if (launchClaim.count) {
    const contest = await prisma.problemContest.findUnique({
      where: { id: contestId },
      select: { createdById: true, titleEn: true }
    });
    if (contest) {
      const recipients = await contestNotificationRecipients(contest.createdById);
      if (recipients.length) {
        await prisma.notification.createMany({
          data: recipients.map(({ id }) => ({
            userId: id,
            actorId: contest.createdById,
            type: NotificationType.CONTEST_UPDATE,
            title: "A new weekly contest has begun",
            body: contest.titleEn,
            href: "/contest"
          }))
        });
      }
    }
  }

  const claimed = await prisma.problemContest.updateMany({
    where: {
      id: contestId,
      publishedAt: { not: null },
      resultsPublishedAt: null,
      endDateKey: today,
      deadlineReminderSentAt: null
    },
    data: { deadlineReminderSentAt: new Date() }
  });
  if (!claimed.count) return;
  const recipients = await prisma.user.findMany({
    where: {
      deletedAt: null,
      contestSubmissions: { some: { contestId } },
      notificationPreferences: { none: { type: NotificationType.CONTEST_UPDATE, enabled: false } }
    },
    select: { id: true }
  });
  if (!recipients.length) return;
  await prisma.notification.createMany({
    data: recipients.map(({ id }) => ({
      userId: id,
      type: NotificationType.CONTEST_UPDATE,
      title: "The weekly contest ends today",
      body: "You can still edit your submitted problem until the end of the day in Paris.",
      href: "/contest"
    }))
  });
}
