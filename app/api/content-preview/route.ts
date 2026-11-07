import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { CONTENT_LIMITS } from "@/lib/content-limits";
import { renderInlineMarkdown, renderMarkdown } from "@/lib/markdown";
import { assertRateLimit } from "@/lib/rate-limit";
import { parseProblemCitations } from "@/lib/problem-citations";
import { parseAdditionalConceptSlugs } from "@/lib/additional-concept-links";
import { uncitedAdditionalConceptLinks } from "@/lib/additional-concept-links-db";
import { contentWithHistory } from "@/lib/content-history";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to preview this content." }, { status: 401 });

  try {
    await assertRateLimit(`content-preview:${user.id}`, 30, 60_000);
  } catch {
    return NextResponse.json({ error: "Too many previews. Please wait a moment." }, { status: 429 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid preview request." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid preview request." }, { status: 400 });
  }

  const { title, bodyMarkdown, historyMarkdown = "", historyEnabled, historySpoiler } = payload as { title?: unknown; bodyMarkdown?: unknown; historyMarkdown?: unknown; historyEnabled?: unknown; historySpoiler?: unknown };
  if (typeof title !== "string" || typeof bodyMarkdown !== "string" || typeof historyMarkdown !== "string") {
    return NextResponse.json({ error: "Invalid preview content." }, { status: 400 });
  }
  if (title.length > CONTENT_LIMITS.title || bodyMarkdown.length > CONTENT_LIMITS.markdown || historyMarkdown.length > CONTENT_LIMITS.markdown) {
    return NextResponse.json({ error: "This content is too long to preview." }, { status: 413 });
  }

  const [titleHtml, bodyHtml, historyHtml] = await Promise.all([
    renderInlineMarkdown(title),
    renderMarkdown(bodyMarkdown),
    historyEnabled === true && historyMarkdown.trim() ? renderMarkdown(historyMarkdown) : ""
  ]);

  try {
    const citations = parseProblemCitations((payload as { citations?: unknown }).citations ?? []);
    const extras = payload as { additionalConceptSlugs?: unknown; language?: unknown };
    const slugs = parseAdditionalConceptSlugs(extras.additionalConceptSlugs ?? []);
    const additionalLinks = await uncitedAdditionalConceptLinks(slugs, contentWithHistory(bodyMarkdown, { historyMarkdown, historyEnabled: historyEnabled === true, historySpoiler: historySpoiler === true }), typeof extras.language === "string" && extras.language.length <= 10 ? extras.language : "en");
    return NextResponse.json({ titleHtml, bodyHtml, historyHtml, historySpoiler: historySpoiler === true, additionalLinks, citations, isOriginal: (payload as { isOriginal?: unknown }).isOriginal === true });
  } catch {
    return NextResponse.json({ error: "Invalid links or references." }, { status: 400 });
  }
}
