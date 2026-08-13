import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CONTENT_LIMITS } from "@/lib/content-limits";
import { renderInlineMarkdown, renderMarkdown } from "@/lib/markdown";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to preview this content." }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid preview request." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid preview request." }, { status: 400 });
  }

  const { title, bodyMarkdown } = payload as { title?: unknown; bodyMarkdown?: unknown };
  if (typeof title !== "string" || typeof bodyMarkdown !== "string") {
    return NextResponse.json({ error: "Invalid preview content." }, { status: 400 });
  }
  if (title.length > CONTENT_LIMITS.title || bodyMarkdown.length > CONTENT_LIMITS.markdown) {
    return NextResponse.json({ error: "This content is too long to preview." }, { status: 413 });
  }

  const [titleHtml, bodyHtml] = await Promise.all([
    renderInlineMarkdown(title),
    renderMarkdown(bodyMarkdown)
  ]);

  return NextResponse.json({ titleHtml, bodyHtml });
}
