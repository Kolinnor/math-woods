"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_LATEX_PREFERENCES, parseLatexPreferenceForm } from "@/lib/latex-preferences";
import { assertRateLimit } from "@/lib/rate-limit";

export async function updateLatexPreferencesAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`latex-preferences:${user.id}`, 20, 60_000);

  const preferences = parseLatexPreferenceForm(formData);

  await prisma.latexPreference.upsert({
    where: { userId: user.id },
    update: preferences,
    create: {
      userId: user.id,
      ...preferences
    }
  });

  revalidatePath("/settings");
  redirect("/settings?tab=latex&updated=latex");
}

export async function resetLatexPreferencesAction() {
  const user = await requireUser();
  await assertRateLimit(`latex-preferences-reset:${user.id}`, 8, 60_000);

  await prisma.latexPreference.upsert({
    where: { userId: user.id },
    update: DEFAULT_LATEX_PREFERENCES,
    create: {
      userId: user.id,
      ...DEFAULT_LATEX_PREFERENCES
    }
  });

  revalidatePath("/settings");
  redirect("/settings?tab=latex&updated=latex-reset");
}
