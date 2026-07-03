"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { CONTENT_LIMITS, boundedText, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { ensureDefaultTips } from "@/lib/daily-tip";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

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

export async function updateTipAction(tipId: number, formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit tips.");
  await assertRateLimit(`tip:update:${user.id}`, 30, 60_000);
  await ensureDefaultTips();

  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const description = requiredBoundedText(formData.get("description"), CONTENT_LIMITS.mediumText, "Description");
  const body = boundedText(formData.get("body"), CONTENT_LIMITS.longNote, "Body") || description;
  const problemIds = parseTipProblemIds(formData.getAll("problemIds"));

  await prisma.$transaction(async (tx) => {
    const validProblems = problemIds.length
      ? await tx.problem.findMany({
          where: { id: { in: problemIds }, status: "PUBLISHED", listed: true },
          select: { id: true }
        })
      : [];
    const validProblemIds = new Set(validProblems.map((problem) => problem.id));
    const orderedProblemIds = problemIds.filter((problemId) => validProblemIds.has(problemId));

    await tx.tip.update({
      where: { id: tipId },
      data: {
        title,
        description,
        body
      }
    });

    await tx.$executeRaw`DELETE FROM "TipProblem" WHERE "tipId" = ${tipId}`;
    for (const [index, problemId] of orderedProblemIds.entries()) {
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "TipProblem" ("tipId", "problemId", "position") VALUES (${tipId}, ${problemId}, ${index + 1})`
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
