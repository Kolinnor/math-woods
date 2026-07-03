"use server";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, optionalBoundedText, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

function intField(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

async function requireFaqAdmin() {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit the FAQ.");
  await assertRateLimit(`faq-edit:${user.id}`, 80, 60_000);
  return user;
}

function revalidateFaq() {
  revalidatePath("/about");
  revalidatePath("/about/faq/edit");
}

export async function createFaqSectionAction(formData: FormData) {
  await requireFaqAdmin();
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Section title");
  const anchorId = optionalBoundedText(formData.get("anchorId"), CONTENT_LIMITS.shortText, "Anchor ID") ?? "";
  const lastSection = await prisma.faqSection.findFirst({ orderBy: { position: "desc" }, select: { position: true } });

  await prisma.faqSection.create({
    data: {
      title,
      anchorId,
      position: intField(formData.get("position"), (lastSection?.position ?? -1) + 1)
    }
  });

  revalidateFaq();
  redirect("/about/faq/edit?updated=section-created" as Route);
}

export async function updateFaqSectionAction(sectionId: number, formData: FormData) {
  await requireFaqAdmin();
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Section title");
  const anchorId = optionalBoundedText(formData.get("anchorId"), CONTENT_LIMITS.shortText, "Anchor ID") ?? "";

  await prisma.faqSection.update({
    where: { id: sectionId },
    data: {
      title,
      anchorId,
      position: intField(formData.get("position"), 0)
    }
  });

  revalidateFaq();
  redirect("/about/faq/edit?updated=section" as Route);
}

export async function deleteFaqSectionAction(sectionId: number) {
  await requireFaqAdmin();
  await prisma.faqSection.delete({ where: { id: sectionId } });
  revalidateFaq();
  redirect("/about/faq/edit?updated=section-deleted" as Route);
}

export async function createFaqItemAction(sectionId: number, formData: FormData) {
  await requireFaqAdmin();
  const question = requiredBoundedText(formData.get("question"), CONTENT_LIMITS.title, "Question");
  const answerMarkdown = requiredBoundedText(formData.get("answerMarkdown"), CONTENT_LIMITS.markdown, "Answer", {
    trim: false
  });
  const lastItem = await prisma.faqItem.findFirst({
    where: { sectionId },
    orderBy: { position: "desc" },
    select: { position: true }
  });

  await prisma.faqItem.create({
    data: {
      sectionId,
      question,
      answerMarkdown,
      position: intField(formData.get("position"), (lastItem?.position ?? -1) + 1)
    }
  });

  revalidateFaq();
  redirect("/about/faq/edit?updated=item-created" as Route);
}

export async function updateFaqItemAction(itemId: number, formData: FormData) {
  await requireFaqAdmin();
  const question = requiredBoundedText(formData.get("question"), CONTENT_LIMITS.title, "Question");
  const answerMarkdown = requiredBoundedText(formData.get("answerMarkdown"), CONTENT_LIMITS.markdown, "Answer", {
    trim: false
  });
  const sectionId = intField(formData.get("sectionId"), 0);

  await prisma.faqItem.update({
    where: { id: itemId },
    data: {
      sectionId,
      question,
      answerMarkdown,
      position: intField(formData.get("position"), 0)
    }
  });

  revalidateFaq();
  redirect("/about/faq/edit?updated=item" as Route);
}

export async function deleteFaqItemAction(itemId: number) {
  await requireFaqAdmin();
  await prisma.faqItem.delete({ where: { id: itemId } });
  revalidateFaq();
  redirect("/about/faq/edit?updated=item-deleted" as Route);
}
