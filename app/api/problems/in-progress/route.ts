import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { IN_PROGRESS_PAGE_SIZE, inProgressProblemsForUser } from "@/lib/in-progress-problems";

export const dynamic = "force-dynamic";

/** Next page of the signed-in user's in-progress problems, for the infinite list on /problems. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const offset = Number(params.get("offset") ?? 0);
  const limit = Number(params.get("limit") ?? IN_PROGRESS_PAGE_SIZE);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  }

  const [t, locale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const page = await inProgressProblemsForUser(user, t, locale, offset, limit);
  return NextResponse.json(page, { headers: { "cache-control": "no-store" } });
}
