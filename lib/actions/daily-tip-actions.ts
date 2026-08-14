"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { upcomingDailyProblemDateKeys } from "@/lib/daily-problem-schedule";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

function scheduledField(dateKey: string) {
  return `tipId:${dateKey}`;
}

export async function updateDailyTipScheduleAction(formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit the tip of the day schedule.");
  await assertRateLimit(`daily-tip-schedule:update:${user.id}`, 20, 60_000);

  const allowedDateKeys = new Set(upcomingDailyProblemDateKeys());
  const submittedDateKeys = formData
    .getAll("dateKey")
    .map(String)
    .filter((dateKey, index, dateKeys) => allowedDateKeys.has(dateKey) && dateKeys.indexOf(dateKey) === index);

  if (submittedDateKeys.length !== allowedDateKeys.size) {
    throw new Error("The daily tip schedule is out of date. Reload the page and try again.");
  }

  await prisma.$transaction(async (tx) => {
    for (const dateKey of submittedDateKeys) {
      const tipId = Number(formData.get(scheduledField(dateKey)));
      if (!Number.isInteger(tipId) || tipId <= 0) {
        await tx.dailyTipSchedule.deleteMany({ where: { dateKey } });
        continue;
      }

      const tip = await tx.tip.findUnique({ where: { id: tipId }, select: { id: true } });
      if (!tip) throw new Error(`The selected tip for ${dateKey} is not available.`);

      await tx.dailyTipSchedule.upsert({
        where: { dateKey },
        create: { dateKey, tipId },
        update: { tipId }
      });
    }
  });

  revalidatePath("/");
  revalidatePath("/tips/tip-of-the-day");
  redirect("/tips/tip-of-the-day?saved=1");
}
