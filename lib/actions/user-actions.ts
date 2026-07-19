"use server";

import { MathDomain } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { parseMathLevel } from "@/lib/math-levels";
import { assertRateLimit } from "@/lib/rate-limit";
import { normalizeDisplayName } from "@/lib/user-display";

function profileWebsite(value: FormDataEntryValue | null) {
  const raw = boundedText(value, CONTENT_LIMITS.mediumText, "Website");
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Website must be a valid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Website must use HTTP or HTTPS.");
  return url.toString();
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`profile:${user.id}`, 20, 60_000);
  const displayName = normalizeDisplayName(formData.get("displayName"));
  const bio = boundedText(formData.get("bio"), CONTENT_LIMITS.mediumText, "Bio");
  const affiliation = boundedText(formData.get("affiliation"), CONTENT_LIMITS.title, "Affiliation") || null;
  const websiteUrl = profileWebsite(formData.get("websiteUrl"));
  const mathematicalDomains = [...new Set(formData.getAll("mathematicalDomains").map(String))]
    .filter((domain): domain is MathDomain => Object.values(MathDomain).includes(domain as MathDomain));
  const openToCollaboration = formData.get("openToCollaboration") === "on";
  const mathLevel = parseMathLevel(formData.get("mathLevel"));

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName,
      bio,
      affiliation,
      websiteUrl,
      mathematicalDomains,
      openToCollaboration,
      mathLevel
    }
  });

  revalidatePath(`/profile/${user.username}`);
  revalidatePath("/mathematicians");
  redirect(`/profile/${user.username}`);
}
