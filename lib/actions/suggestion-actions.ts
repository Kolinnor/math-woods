"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth";
import { CONTENT_LIMITS, requiredBoundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

export async function createSuggestionAction(formData: FormData) {
  const user = await requireVerifiedUser();
  const title = requiredBoundedText(formData.get("title"), CONTENT_LIMITS.title, "Title");
  const body = requiredBoundedText(formData.get("body"), CONTENT_LIMITS.longNote, "Suggestion");
  await assertRateLimit(`suggestion:${user.id}`, 4, 60_000);

  await prisma.suggestion.create({
    data: {
      authorId: user.id,
      title,
      body
    }
  });

  revalidatePath("/suggestions");
  redirect("/suggestions?submitted=1");
}
