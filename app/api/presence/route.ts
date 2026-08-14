import { NextResponse } from "next/server";
import { recordSitePresence } from "@/lib/site-presence";
import { isSitePresenceId } from "@/lib/site-presence-config";
import { assertRateLimit } from "@/lib/rate-limit";
import { clientAddressFromHeaders } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const presenceId = request.headers.get("x-math-woods-presence");
  if (!isSitePresenceId(presenceId)) {
    return NextResponse.json({ error: "Invalid presence identifier." }, { status: 400 });
  }

  try {
    const clientAddress = clientAddressFromHeaders(request.headers);
    await Promise.all([
      assertRateLimit(`presence:id:${presenceId}`, 10, 60_000),
      assertRateLimit(`presence:ip:${clientAddress}`, 120, 60_000)
    ]);
  } catch {
    return NextResponse.json({ error: "Too many presence updates." }, { status: 429 });
  }

  await recordSitePresence(presenceId as string);
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" }
  });
}
