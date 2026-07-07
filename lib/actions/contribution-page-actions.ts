"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { ensureEditableContributionPage } from "@/lib/contribution-page";
import { prisma } from "@/lib/db";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

function intField(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

async function requireContributionPageAdmin() {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit the contribution page.");
  await assertRateLimit(`contribution-page-edit:${user.id}`, 80, 60_000);
  return user;
}

function revalidateContributionPage() {
  revalidatePath("/contributing");
  revalidatePath("/contributing/edit");
}

export async function updateContributionPageContentAction(formData: FormData) {
  await requireContributionPageAdmin();
  await ensureEditableContributionPage();

  await prisma.contributionPageContent.update({
    where: { id: 1 },
    data: {
      title: requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Page title"),
      requestEyebrow: requiredBoundedText(formData.get("requestEyebrow"), CONTENT_LIMITS.title, "Request eyebrow"),
      requestTitle: requiredBoundedText(formData.get("requestTitle"), CONTENT_LIMITS.title, "Request title"),
      requestIntro: requiredBoundedText(formData.get("requestIntro"), CONTENT_LIMITS.longNote, "Request intro")
    }
  });

  revalidateContributionPage();
  redirect("/contributing/edit?updated=content" as Route);
}

export async function updateContributionPageSectionAction(sectionId: number, formData: FormData) {
  await requireContributionPageAdmin();
  await ensureEditableContributionPage();

  await prisma.contributionPageSection.update({
    where: { id: sectionId },
    data: {
      title: requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Section title"),
      bodyMarkdown: requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Section body", {
        trim: false
      }),
      position: intField(formData.get("position"), 0)
    }
  });

  revalidateContributionPage();
  redirect("/contributing/edit?updated=section" as Route);
}

export async function createContributionPageSectionAction(formData: FormData) {
  await requireContributionPageAdmin();
  await ensureEditableContributionPage();
  const lastSection = await prisma.contributionPageSection.findFirst({
    orderBy: { position: "desc" },
    select: { position: true }
  });

  await prisma.contributionPageSection.create({
    data: {
      title: requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Section title"),
      bodyMarkdown: requiredBoundedText(formData.get("bodyMarkdown"), CONTENT_LIMITS.markdown, "Section body", {
        trim: false
      }),
      position: intField(formData.get("position"), (lastSection?.position ?? -1) + 1)
    }
  });

  revalidateContributionPage();
  redirect("/contributing/edit?updated=section-created" as Route);
}

export async function deleteContributionPageSectionAction(sectionId: number) {
  await requireContributionPageAdmin();
  await prisma.contributionPageSection.delete({ where: { id: sectionId } });

  revalidateContributionPage();
  redirect("/contributing/edit?updated=section-deleted" as Route);
}
