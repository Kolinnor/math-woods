"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { checkProfileAchievements } from "@/lib/achievements";
import { boundedText, CONTENT_LIMITS } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { canChangeDisplayName, displayNameActuallyChanged } from "@/lib/display-name-change";
import { parseMathLevel } from "@/lib/math-levels";
import { assertRateLimit } from "@/lib/rate-limit";
import { acquireTransactionLock } from "@/lib/transaction-lock";
import { displayNameComparisonKey, displayNameForUser, normalizeDisplayName } from "@/lib/user-display";
import { parseUserDiscoverySource } from "@/lib/user-discovery-source";
import { profilePath } from "@/lib/usernames";

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

  let result: { outcome: "updated" | "locked" | "unavailable"; profileSlug: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      await acquireTransactionLock(tx, `display-name-change:${user.id}`);
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          username: true,
          profileSlug: true,
          displayName: true,
          displayNameChangedAt: true,
          role: true
        }
      });
      if (!current) throw new Error("User not found.");

      const oldDisplayName = displayNameForUser(current);
      const nameChanged = displayNameActuallyChanged(oldDisplayName, displayName);
      const now = new Date();
      if (nameChanged && !canChangeDisplayName(current, now)) {
        return { outcome: "locked" as const, profileSlug: current.profileSlug };
      }

      if (nameChanged) {
        await acquireTransactionLock(tx, `display-name:${displayNameComparisonKey(displayName)}`);
        const conflictingUser = await tx.user.findFirst({
          where: {
            id: { not: current.id },
            displayName: { equals: displayName, mode: "insensitive" },
            deletedAt: null
          },
          select: { id: true }
        });
        if (conflictingUser) {
          return { outcome: "unavailable" as const, profileSlug: current.profileSlug };
        }
      }

      await tx.user.update({
        where: { id: current.id },
        data: {
          displayName,
          ...(nameChanged ? { displayNameChangedAt: now } : {}),
          bio,
          mathLevel,
          discoverySource,
          discoverySourceDetail
        }
      });

      if (nameChanged) {
        await tx.displayNameChange.create({
          data: {
            userId: current.id,
            actorId: user.id,
            oldDisplayName,
            newDisplayName: displayName,
            changedAt: now
          }
        });
      }

      return { outcome: "updated" as const, profileSlug: current.profileSlug };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      redirect(`${profilePath(user, "/edit")}?profileError=name-unavailable` as never);
    }
    throw error;
  }

  if (result.outcome === "locked") {
    redirect(`${profilePath(result, "/edit")}?profileError=name-change-locked` as never);
  }
  if (result.outcome === "unavailable") {
    redirect(`${profilePath(result, "/edit")}?profileError=name-unavailable` as never);
  }

  await checkProfileAchievements(user.id);

  revalidatePath(profilePath(result));
  revalidatePath("/users");
  revalidatePath("/moderation/profile-name-changes");
  redirect(profilePath(result));
}
