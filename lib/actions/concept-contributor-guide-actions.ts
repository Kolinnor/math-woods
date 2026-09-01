"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import type { InterfaceLocale } from "@/lib/i18n/types";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

function guideLocale(value: string): InterfaceLocale {
  if (value === "en" || value === "fr") return value;
  throw new Error("Unsupported concept guide language.");
}

export async function updateConceptContributorGuideAction(language: string, formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit the concept contributor guide.");
  await assertRateLimit(`concept-guide-edit:${user.id}`, 40, 60_000);

  const locale = guideLocale(language);
  const content = {
    title: requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Guide title"),
    description: requiredBoundedText(formData.get("description"), CONTENT_LIMITS.longNote, "Guide description"),
    bodyMarkdown: requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Guide content", {
      trim: false
    })
  };

  await prisma.conceptContributorGuideContent.upsert({
    where: { language: locale },
    create: { language: locale, ...content },
    update: content
  });

  revalidatePath("/contributing/guides/concepts");
  revalidatePath("/contributing/guides/concepts/edit");
  redirect(`/contributing/guides/concepts?saved=${locale}`);
}
