"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import type { InterfaceLocale } from "@/lib/i18n/types";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

function priorityLocale(value: string): InterfaceLocale {
  if (value === "en" || value === "fr") return value;
  throw new Error("Unsupported priorities language.");
}

export async function updateHomePriorityAction(language: string, formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit homepage priorities.");
  await assertRateLimit(`home-priority-edit:${user.id}`, 40, 60_000);

  const locale = priorityLocale(language);
  const content = {
    title: requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Priorities title"),
    body: requiredBoundedText(formData.get("body"), CONTENT_LIMITS.longNote, "Priorities text")
  };

  await prisma.homePriorityContent.upsert({
    where: { language: locale },
    create: { language: locale, ...content },
    update: content
  });

  revalidatePath("/");
  revalidatePath("/tips/priorities");
  redirect(`/tips/priorities?saved=${locale}` as Route);
}
