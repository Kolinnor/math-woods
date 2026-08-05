import { NextResponse } from "next/server";
import { recordSitePresence } from "@/lib/site-presence";
import { isSitePresenceId } from "@/lib/site-presence-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const presenceId = request.headers.get("x-math-woods-presence");
  if (!isSitePresenceId(presenceId)) {
    return NextResponse.json({ error: "Invalid presence identifier." }, { status: 400 });
  }

  await recordSitePresence(presenceId as string);
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" }
  });
}
