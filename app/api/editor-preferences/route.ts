import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_LATEX_PREFERENCES, mergeLatexPreferences, type LatexPreferenceValues } from "@/lib/latex-preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const savedPreferences = user
    ? await prisma.latexPreference.findUnique({
        where: { userId: user.id }
      })
    : null;
  const preferences = mergeLatexPreferences(savedPreferences);
  const payload = Object.fromEntries(
    Object.keys(DEFAULT_LATEX_PREFERENCES).map((key) => [
      key,
      preferences[key as keyof LatexPreferenceValues]
    ])
  );

  return NextResponse.json({
    ...payload,
    editorSettingsVisited: Boolean(savedPreferences)
  });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  await prisma.latexPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      ...DEFAULT_LATEX_PREFERENCES
    }
  });

  return NextResponse.json({ ok: true });
}
