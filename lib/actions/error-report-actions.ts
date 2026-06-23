"use server";

import { revalidatePath } from "next/cache";
import { requireModerator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

export async function markErrorReportReviewedAction(errorReportId: number) {
  const user = await requireModerator();
  await assertRateLimit(`error-report-review:${user.id}`, 60, 60_000);

  await prisma.errorReport.update({
    where: { id: errorReportId },
    data: { reviewedAt: new Date() }
  });

  revalidatePath("/moderation");
}
