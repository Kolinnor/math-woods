import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requestEasierRecommendations } from "@/lib/recommendation-events";
import { assertRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    await assertRateLimit(`recommendations:easier:${user.id}`, 10, 60_000);
  } catch {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  await requestEasierRecommendations(user.id);
  return NextResponse.json({ ok: true });
}
