import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { mergeLatexPreferences } from "@/lib/latex-preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const savedPreferences = user
    ? await prisma.latexPreference.findUnique({
        where: { userId: user.id }
      })
    : null;
  const preferences = mergeLatexPreferences(savedPreferences);

  return NextResponse.json({
    markdownHeadingShortcuts: preferences.markdownHeadingShortcuts,
    markdownHeading1Shortcut: preferences.markdownHeading1Shortcut,
    markdownHeading2Shortcut: preferences.markdownHeading2Shortcut,
    markdownHeading3Shortcut: preferences.markdownHeading3Shortcut,
    markdownHeading4Shortcut: preferences.markdownHeading4Shortcut,
    markdownHeading5Shortcut: preferences.markdownHeading5Shortcut,
    markdownHeading6Shortcut: preferences.markdownHeading6Shortcut
  });
}
