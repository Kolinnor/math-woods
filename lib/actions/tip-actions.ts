"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, optionalBoundedText, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { ensureDefaultTips } from "@/lib/daily-tip";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import {
  MAX_TIP_IMAGES,
  normalizeTipImagePosition,
  normalizeTipImageUrl,
  type TipImageValue
} from "@/lib/tip-images";

function parseTipProblemIds(values: FormDataEntryValue[]) {
  const seen = new Set<number>();
  const problemIds: number[] = [];

  for (const value of values) {
    const problemId = Number(value);
    if (!Number.isInteger(problemId) || problemId <= 0 || seen.has(problemId)) continue;
    seen.add(problemId);
    problemIds.push(problemId);
    if (problemIds.length >= 8) break;
  }

  return problemIds;
}

function parseTipTranslations(formData: FormData) {
  const english = {
    language: "en",
    title: requiredBoundedText(formData.get("titleEn"), CONTENT_LIMITS.title, "English title"),
    body: requiredBoundedText(formData.get("bodyEn"), CONTENT_LIMITS.longNote, "English tip text")
  };
  const frenchTitle = optionalBoundedText(formData.get("titleFr"), CONTENT_LIMITS.title, "French title");
  const frenchBody = optionalBoundedText(formData.get("bodyFr"), CONTENT_LIMITS.longNote, "French tip text");
  if (Boolean(frenchTitle) !== Boolean(frenchBody)) {
    throw new Error("The French title and tip text must either both be filled in or both be empty.");
  }
  return {
    english,
    french: frenchTitle && frenchBody ? { language: "fr", title: frenchTitle, body: frenchBody } : null
  };
}

async function orderedTipProblems(
  tx: Prisma.TransactionClient,
  problemIds: number[]
) {
  const problems = problemIds.length
    ? await tx.problem.findMany({
        where: { id: { in: problemIds }, status: "PUBLISHED", listed: true },
        select: { id: true, translationGroupId: true }
      })
    : [];
  const problemsById = new Map(problems.map((problem) => [problem.id, problem]));
  const seenGroups = new Set<string>();
  return problemIds.flatMap((problemId) => {
    const problem = problemsById.get(problemId);
    if (!problem || seenGroups.has(problem.translationGroupId)) return [];
    seenGroups.add(problem.translationGroupId);
    return [problem];
  });
}

function parseTipImages(formData: FormData): TipImageValue[] {
  const imageUrls = formData.getAll("imageUrls");
  const positionXs = formData.getAll("imagePositionXs");
  const positionYs = formData.getAll("imagePositionYs");
  const images: TipImageValue[] = [];

  for (let index = 0; index < imageUrls.length && images.length < MAX_TIP_IMAGES; index += 1) {
    const imageUrl = normalizeTipImageUrl(imageUrls[index]);
    if (!imageUrl) continue;
    images.push({
      imageUrl,
      imagePositionX: normalizeTipImagePosition(positionXs[index]),
      imagePositionY: normalizeTipImagePosition(positionYs[index])
    });
  }

  return images;
}

export async function createTipAction(formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can create tips.");
  await assertRateLimit(`tip:create:${user.id}`, 10, 60_000);
  await ensureDefaultTips();

  const { english, french } = parseTipTranslations(formData);
  const images = parseTipImages(formData);
  const primaryImage = images[0] ?? null;
  const showInMainMenu = formData.get("showInMainMenu") === "on";
  const problemIds = parseTipProblemIds(formData.getAll("problemIds"));

  const tip = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE "Tip" IN SHARE ROW EXCLUSIVE MODE`;
    const lastTip = await tx.tip.findFirst({
      orderBy: { position: "desc" },
      select: { position: true }
    });
    const orderedProblems = await orderedTipProblems(tx, problemIds);
    const createdTip = await tx.tip.create({
      data: {
        position: (lastTip?.position ?? -1) + 1,
        title: english.title,
        description: english.body,
        body: english.body,
        imageUrl: primaryImage?.imageUrl ?? null,
        imagePositionX: primaryImage?.imagePositionX ?? 50,
        imagePositionY: primaryImage?.imagePositionY ?? 50,
        showInMainMenu
      }
    });

    await tx.tipTranslation.createMany({
      data: [english, ...(french ? [french] : [])].map((translation) => ({
        tipId: createdTip.id,
        ...translation
      }))
    });

    if (images.length > 0) {
      await tx.tipImage.createMany({
        data: images.map((image, index) => ({
          tipId: createdTip.id,
          position: index,
          ...image
        }))
      });
    }

    for (const [index, problem] of orderedProblems.entries()) {
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "TipProblemGroup" ("tipId", "translationGroupId", "position") VALUES (${createdTip.id}, ${problem.translationGroupId}, ${index + 1})`
      );
    }

    return createdTip;
  });

  revalidatePath("/");
  revalidatePath("/tips");
  redirect(`/tips?created=${tip.id}`);
}

export async function updateTipAction(tipId: number, formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit tips.");
  await assertRateLimit(`tip:update:${user.id}`, 30, 60_000);
  await ensureDefaultTips();

  const { english, french } = parseTipTranslations(formData);
  const images = parseTipImages(formData);
  const primaryImage = images[0] ?? null;
  const showInMainMenu = formData.get("showInMainMenu") === "on";
  const problemIds = parseTipProblemIds(formData.getAll("problemIds"));

  await prisma.$transaction(async (tx) => {
    const orderedProblems = await orderedTipProblems(tx, problemIds);

    await tx.tip.update({
      where: { id: tipId },
      data: {
        title: english.title,
        description: english.body,
        body: english.body,
        imageUrl: primaryImage?.imageUrl ?? null,
        imagePositionX: primaryImage?.imagePositionX ?? 50,
        imagePositionY: primaryImage?.imagePositionY ?? 50,
        showInMainMenu
      }
    });

    await tx.tipTranslation.upsert({
      where: { tipId_language: { tipId, language: "en" } },
      create: { tipId, ...english },
      update: { title: english.title, body: english.body }
    });
    if (french) {
      await tx.tipTranslation.upsert({
        where: { tipId_language: { tipId, language: "fr" } },
        create: { tipId, ...french },
        update: { title: french.title, body: french.body }
      });
    } else {
      await tx.tipTranslation.deleteMany({ where: { tipId, language: "fr" } });
    }

    await tx.tipImage.deleteMany({ where: { tipId } });
    if (images.length > 0) {
      await tx.tipImage.createMany({
        data: images.map((image, index) => ({ tipId, position: index, ...image }))
      });
    }

    await tx.$executeRaw`DELETE FROM "TipProblemGroup" WHERE "tipId" = ${tipId}`;
    for (const [index, problem] of orderedProblems.entries()) {
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "TipProblemGroup" ("tipId", "translationGroupId", "position") VALUES (${tipId}, ${problem.translationGroupId}, ${index + 1})`
      );
    }
  });

  revalidatePath("/");
  revalidatePath("/tips");
  revalidatePath(`/tips/${tipId}/edit`);
  redirect(`/tips?updated=${tipId}`);
}

export async function deleteTipAction(tipId: number) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can delete tips.");
  await assertRateLimit(`tip:delete:${user.id}`, 10, 60_000);
  await ensureDefaultTips();

  await prisma.$transaction(async (tx) => {
    const tip = await tx.tip.findUnique({ where: { id: tipId }, select: { position: true } });
    if (!tip) return;

    const tipCount = await tx.tip.count();
    if (tipCount <= 1) throw new Error("Cannot delete the last tip.");

    await tx.tip.delete({ where: { id: tipId } });
    await tx.$executeRaw`UPDATE "Tip" SET "position" = "position" + 10000 WHERE "position" > ${tip.position}`;
    await tx.$executeRaw`UPDATE "Tip" SET "position" = "position" - 10001 WHERE "position" >= ${tip.position + 10001}`;
  });

  revalidatePath("/");
  revalidatePath("/tips");
  redirect("/tips?deleted=1");
}
