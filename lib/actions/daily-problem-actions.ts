"use server";

import { NotificationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateFromDailyProblemKey, upcomingDailyProblemDateKeys } from "@/lib/daily-problem-schedule";
import { createNotification } from "@/lib/notifications";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { normalizeTipImagePosition, normalizeTipImageUrl } from "@/lib/tip-images";

function scheduledField(name: string, dateKey: string) {
  return `${name}:${dateKey}`;
}

function notificationDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric"
  }).format(dateFromDailyProblemKey(dateKey));
}

export async function updateDailyProblemScheduleAction(formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit the problem of the day schedule.");
  await assertRateLimit(`daily-problem-schedule:update:${user.id}`, 20, 60_000);

  const allowedDateKeys = new Set(upcomingDailyProblemDateKeys());
  const submittedDateKeys = formData
    .getAll("dateKey")
    .map(String)
    .filter((dateKey, index, dateKeys) => allowedDateKeys.has(dateKey) && dateKeys.indexOf(dateKey) === index);

  if (submittedDateKeys.length !== allowedDateKeys.size) {
    throw new Error("The daily problem schedule is out of date. Reload the page and try again.");
  }

  const newSelections = await prisma.$transaction(async (tx) => {
    const selectedProblems: Array<{
      authorId: number;
      dateKey: string;
      slug: string;
      title: string;
    }> = [];

    for (const dateKey of submittedDateKeys) {
      const problemId = Number(formData.get(scheduledField("problemId", dateKey)));
      if (!Number.isInteger(problemId) || problemId <= 0) {
        await tx.dailyProblemSchedule.deleteMany({ where: { dateKey } });
        continue;
      }

      const problem = await tx.problem.findFirst({
        where: { id: problemId, status: "PUBLISHED", listed: true, isExercise: false },
        select: { authorId: true, id: true, slug: true, title: true }
      });
      if (!problem) throw new Error(`The selected problem for ${dateKey} is not available.`);

      const existingSchedule = await tx.dailyProblemSchedule.findUnique({
        where: { dateKey },
        select: { problemId: true }
      });

      const imageUrl = normalizeTipImageUrl(formData.get(scheduledField("imageUrl", dateKey)));
      const imagePositionX = normalizeTipImagePosition(formData.get(scheduledField("imagePositionX", dateKey)));
      const imagePositionY = normalizeTipImagePosition(formData.get(scheduledField("imagePositionY", dateKey)));

      await tx.dailyProblemSchedule.upsert({
        where: { dateKey },
        create: { dateKey, problemId, imageUrl, imagePositionX, imagePositionY },
        update: { problemId, imageUrl, imagePositionX, imagePositionY }
      });

      if (existingSchedule?.problemId !== problem.id) {
        selectedProblems.push({
          authorId: problem.authorId,
          dateKey,
          slug: problem.slug,
          title: problem.title
        });
      }
    }

    return selectedProblems;
  });

  await Promise.all(
    newSelections.map((selection) =>
      createNotification({
        userId: selection.authorId,
        actorId: user.id,
        type: NotificationType.PROBLEM_OF_THE_DAY,
        title: "Your problem was selected as the problem of the day",
        body: `"${selection.title}" will be featured on ${notificationDateLabel(selection.dateKey)}.`,
        href: `/problems/${selection.slug}`
      })
    )
  );

  revalidatePath("/");
  revalidatePath("/tips/problem-of-the-day");
  redirect("/tips/problem-of-the-day?saved=1");
}
