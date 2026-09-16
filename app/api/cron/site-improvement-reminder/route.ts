import { NextResponse } from "next/server";
import { sendSiteImprovementReminder } from "@/lib/site-improvement-reminders";
import { assertRateLimit } from "@/lib/rate-limit";
import { clientAddressFromHeaders, secretsMatch } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!secret || !(secretsMatch(bearer, secret) || secretsMatch(request.headers.get("x-cron-secret"), secret))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    await assertRateLimit(`cron-site-improvements:${clientAddressFromHeaders(request.headers)}`, 10, 60_000);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  return NextResponse.json({ ok: true, ...await sendSiteImprovementReminder() });
}
