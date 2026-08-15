import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CONTENT_LIMITS } from "@/lib/content-limits";
import { renderInlineMarkdown } from "@/lib/markdown";
import { assertRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to preview this title." }, { status: 401 });

  try {
    await assertRateLimit(`title-preview:${user.id}`, 240, 60_000);
  } catch {
    return NextResponse.json({ error: "Too many title previews." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid preview request." }, { status: 400 });
  }

  const title = payload && typeof payload === "object" && "title" in payload
    ? (payload as { title: unknown }).title
    : null;
  if (typeof title !== "string" || title.length > CONTENT_LIMITS.title) {
    return NextResponse.json({ error: "Invalid title." }, { status: 400 });
  }

  return NextResponse.json({ html: await renderInlineMarkdown(title) });
}
