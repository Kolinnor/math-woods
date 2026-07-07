import { NextResponse } from "next/server";
import { sendContributionRequestReminders } from "@/lib/contribution-request-reminders";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  return request.headers.get("authorization") === `Bearer ${secret}` || request.headers.get("x-cron-secret") === secret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await sendContributionRequestReminders();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
