"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 1200);

  await prisma.user.update({
    where: { id: user.id },
    data: { bio }
  });

  revalidatePath(`/profile/${user.username}`);
  redirect(`/profile/${user.username}`);
}
