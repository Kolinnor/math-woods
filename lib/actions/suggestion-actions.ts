"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertRateLimit } from "@/lib/rate-limit";

export async function createSuggestionAction(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim().slice(0, 140);
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  await assertRateLimit(`suggestion:${user.id}`, 4, 60_000);

  if (!title || !body) throw new Error("A title and description are required.");

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
