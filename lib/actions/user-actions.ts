"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { parseMathLevel } from "@/lib/math-levels";
import { assertRateLimit } from "@/lib/rate-limit";
import { normalizeDisplayName } from "@/lib/user-display";

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`profile:${user.id}`, 20, 60_000);
  const displayName = normalizeDisplayName(formData.get("displayName"));
  const bio = boundedText(formData.get("bio"), CONTENT_LIMITS.mediumText, "Bio");
  const mathLevel = parseMathLevel(formData.get("mathLevel"));

  await prisma.user.update({
    where: { id: user.id },
    data: { displayName, bio, mathLevel }
  });

  revalidatePath(`/profile/${user.username}`);
  redirect(`/profile/${user.username}`);
}
