"use server";

import type { Route } from "next";
import {
  SiteImprovementActivityType,
  SiteImprovementStatus
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireModerator } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { renderMarkdown } from "@/lib/markdown";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  parseSiteImprovementPriority,
  parseSiteImprovementStatus
} from "@/lib/site-improvements";

const BOARD_PATH = "/contributing/tasks/site-improvements";

function improvementPath(id: number) {
  return `${BOARD_PATH}/${id}` as Route;
}

function revalidateImprovement(id: number) {
  revalidatePath(BOARD_PATH);
  revalidatePath(improvementPath(id));
}

export async function createSiteImprovementAction(formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:create:${user.id}`, 8, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const descriptionMarkdown = requiredBoundedText(
    formData.get("descriptionMarkdown"),
    CONTENT_LIMITS.longNote,
    "Description"
  );
  const priority = parseSiteImprovementPriority(formData.get("priority"));
  const descriptionHtml = await renderMarkdown(descriptionMarkdown);

  const improvement = await prisma.$transaction(async (tx) => {
    const created = await tx.siteImprovement.create({
      data: {
        title,
        descriptionMarkdown,
        descriptionHtml,
        priority,
        creatorId: user.id
      }
    });
    await tx.siteImprovementActivity.create({
      data: {
        improvementId: created.id,
        actorId: user.id,
        type: SiteImprovementActivityType.CREATED,
        toValue: SiteImprovementStatus.BACKLOG
      }
    });
    return created;
  });

  revalidateImprovement(improvement.id);
  redirect(improvementPath(improvement.id));
}

export async function updateSiteImprovementDetailsAction(improvementId: number, formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:details:${user.id}`, 30, 60_000);
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const descriptionMarkdown = requiredBoundedText(
    formData.get("descriptionMarkdown"),
    CONTENT_LIMITS.longNote,
    "Description"
  );
  const descriptionHtml = await renderMarkdown(descriptionMarkdown);

  await prisma.$transaction(async (tx) => {
    const current = await tx.siteImprovement.findUnique({
      where: { id: improvementId },
      select: { id: true, creatorId: true, title: true, descriptionMarkdown: true }
    });
    if (!current) throw new Error("Site improvement not found.");
    if (current.creatorId !== user.id && !canUseAdminTools(user)) {
      throw new Error("Only the creator or an admin can edit this improvement.");
    }
    if (current.title === title && current.descriptionMarkdown === descriptionMarkdown) return;
    await tx.siteImprovement.update({
      where: { id: current.id },
      data: { title, descriptionMarkdown, descriptionHtml }
    });
    await tx.siteImprovementActivity.create({
      data: {
        improvementId: current.id,
        actorId: user.id,
        type: SiteImprovementActivityType.DETAILS_CHANGED
      }
    });
  });

  revalidateImprovement(improvementId);
}

export async function updateSiteImprovementStatusAction(improvementId: number, formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:status:${user.id}`, 60, 60_000);
  const status = parseSiteImprovementStatus(formData.get("status"));

  await prisma.$transaction(async (tx) => {
    const current = await tx.siteImprovement.findUnique({
      where: { id: improvementId },
      select: { id: true, status: true }
    });
    if (!current) throw new Error("Site improvement not found.");
    if (current.status === status) return;
    const updated = await tx.siteImprovement.updateMany({
      where: { id: current.id, status: current.status },
      data: {
        status,
        completedAt: status === SiteImprovementStatus.COMPLETED ? new Date() : null
      }
    });
    if (updated.count !== 1) throw new Error("This improvement changed while you were moving it.");
    await tx.siteImprovementActivity.create({
      data: {
        improvementId: current.id,
        actorId: user.id,
        type: SiteImprovementActivityType.STATUS_CHANGED,
        fromValue: current.status,
        toValue: status
      }
    });
  });

  revalidateImprovement(improvementId);
}

export async function updateSiteImprovementPriorityAction(improvementId: number, formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:priority:${user.id}`, 60, 60_000);
  const priority = parseSiteImprovementPriority(formData.get("priority"));

  await prisma.$transaction(async (tx) => {
    const current = await tx.siteImprovement.findUnique({
      where: { id: improvementId },
      select: { id: true, priority: true }
    });
    if (!current) throw new Error("Site improvement not found.");
    if (current.priority === priority) return;
    const updated = await tx.siteImprovement.updateMany({
      where: { id: current.id, priority: current.priority },
      data: { priority }
    });
    if (updated.count !== 1) throw new Error("This improvement changed while you were updating its priority.");
    await tx.siteImprovementActivity.create({
      data: {
        improvementId: current.id,
        actorId: user.id,
        type: SiteImprovementActivityType.PRIORITY_CHANGED,
        fromValue: current.priority,
        toValue: priority
      }
    });
  });

  revalidateImprovement(improvementId);
}

export async function createSiteImprovementCommentAction(improvementId: number, formData: FormData) {
  const user = await requireModerator();
  await assertRateLimit(`site-improvement:comment:${user.id}`, 20, 60_000);
  const bodyMarkdown = requiredBoundedText(
    formData.get("bodyMarkdown"),
    CONTENT_LIMITS.discussionPost,
    "Discussion message"
  );
  const improvement = await prisma.siteImprovement.findUnique({
    where: { id: improvementId },
    select: { id: true }
  });
  if (!improvement) throw new Error("Site improvement not found.");

  const comment = await prisma.siteImprovementComment.create({
    data: {
      improvementId,
      authorId: user.id,
      bodyMarkdown,
      bodyHtml: await renderMarkdown(bodyMarkdown)
    }
  });
  revalidateImprovement(improvementId);
  redirect(`${improvementPath(improvementId)}#comment-${comment.id}` as Route);
}
