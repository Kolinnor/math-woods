import { NextResponse } from "next/server";
import { sendContributionRequestReminders } from "@/lib/contribution-request-reminders";
import { sendDailyConceptReviews } from "@/lib/daily-concept-reviews";
import { assertRateLimit } from "@/lib/rate-limit";
import { clientAddressFromHeaders, secretsMatch } from "@/lib/request-security";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const authorization = request.headers.get("authorization");
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  return secretsMatch(bearer, secret) || secretsMatch(request.headers.get("x-cron-secret"), secret);
}

export async function GET(request: Request) {
  try {
    await assertRateLimit(`cron-reminders:${clientAddressFromHeaders(request.headers)}`, 30, 60_000);
  } catch {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const [contributionRequests, dailyConceptReviews] = await Promise.all([
    sendContributionRequestReminders(),
    sendDailyConceptReviews()
  ]);
  return NextResponse.json({ ok: true, contributionRequests, dailyConceptReviews });
}

export async function POST(request: Request) {
  return GET(request);
}
