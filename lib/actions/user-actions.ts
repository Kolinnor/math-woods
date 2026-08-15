"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { checkProfileAchievements } from "@/lib/achievements";
import { boundedText, CONTENT_LIMITS } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { parseMathLevel } from "@/lib/math-levels";
import { assertRateLimit } from "@/lib/rate-limit";
import { normalizeDisplayName } from "@/lib/user-display";
import { parseUserDiscoverySource } from "@/lib/user-discovery-source";

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`profile:${user.id}`, 20, 60_000);
  const displayName = normalizeDisplayName(formData.get("displayName"));
  const bio = boundedText(formData.get("bio"), CONTENT_LIMITS.mediumText, "Bio");
  const mathLevel = parseMathLevel(formData.get("mathLevel"));
  const discoverySource = parseUserDiscoverySource(formData.get("discoverySource"));
  const discoverySourceDetail = boundedText(
    formData.get("discoverySourceDetail"),
    CONTENT_LIMITS.shortText,
    "Discovery source detail"
  ) || null;
  if (!discoverySource) throw new Error("Please tell us how you heard about Math Woods.");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName,
      bio,
      mathLevel,
      discoverySource,
      discoverySourceDetail
    }
  });

  await checkProfileAchievements(user.id);

  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/users");
  redirect(`/profile/${user.username}`);
}
