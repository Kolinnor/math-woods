import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { friendsMenuDataForUser } from "@/lib/friends-menu";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  return NextResponse.json(await friendsMenuDataForUser(user.id), {
    headers: { "Cache-Control": "no-store" }
  });
}
