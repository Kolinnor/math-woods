import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EXPOSURE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ problemId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: true });

  try {
    await assertRateLimit(`recommendation-exposure:${user.id}`, 30, 60_000);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { problemId: problemIdParam } = await params;
  const problemId = Number(problemIdParam);
  if (!Number.isInteger(problemId) || problemId <= 0) {
    return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { id: true, authorId: true, translationGroupId: true }
  });
  if (!problem) return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  if (problem.authorId === user.id) return NextResponse.json({ ok: true });

  const solved = await prisma.problemAttempt.findFirst({
    where: {
      userId: user.id,
      status: "SOLVED",
      problem: { translationGroupId: problem.translationGroupId }
    },
    select: { id: true }
  });
  if (solved) {
    await prisma.problemRecommendationExposure.deleteMany({
      where: { userId: user.id, translationGroupId: problem.translationGroupId }
    });
    return NextResponse.json({ ok: true });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - EXPOSURE_COOLDOWN_MS);
  const updated = await prisma.problemRecommendationExposure.updateMany({
    where: {
      userId: user.id,
      translationGroupId: problem.translationGroupId,
      lastOpenedAt: { lte: cutoff }
    },
    data: {
      problemId: problem.id,
      exposureCount: { increment: 1 },
      lastOpenedAt: now
    }
  });
  if (updated.count > 0) return NextResponse.json({ ok: true });

  try {
    await prisma.problemRecommendationExposure.create({
      data: {
        userId: user.id,
        problemId: problem.id,
        translationGroupId: problem.translationGroupId,
        firstOpenedAt: now,
        lastOpenedAt: now
      }
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }

  return NextResponse.json({ ok: true });
}
