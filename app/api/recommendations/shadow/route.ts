import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";
import { recommendationShadowForUser } from "@/lib/recommendation-engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ ok: false }, { status: 401 });
  if (!canUseAdminTools(currentUser)) return NextResponse.json({ ok: false }, { status: 403 });
  try {
    await assertRateLimit(`recommendation-shadow:${currentUser.id}`, 30, 60_000);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim();
  const limit = Number.parseInt(searchParams.get("limit") ?? "20", 10);
  const target = username
    ? await prisma.user.findUnique({ where: { username }, select: { id: true } })
    : { id: currentUser.id };
  if (!target) return NextResponse.json({ ok: false }, { status: 404 });

  const shadow = await recommendationShadowForUser(target.id, limit);
  if (!shadow) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, ...shadow });
}
