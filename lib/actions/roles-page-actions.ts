"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { boundedText, CONTENT_LIMITS } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { canUseAdminTools } from "@/lib/permissions";
import { assertRateLimit } from "@/lib/rate-limit";

export async function updateRolesPageAction(formData: FormData) {
  const user = await requireUser();
  if (!canUseAdminTools(user)) throw new Error("Only admins can edit the roles page.");
  await assertRateLimit(`roles-page-edit:${user.id}`, 40, 60_000);

  const bodyMarkdown = boundedText(
    formData.get("bodyMarkdown"),
    CONTENT_LIMITS.markdown,
    "Roles page",
    { trim: false }
  );

  await prisma.rolesPageContent.upsert({
    where: { id: 1 },
    create: { id: 1, bodyMarkdown },
    update: { bodyMarkdown }
  });

  revalidatePath("/roles");
  revalidatePath("/roles/edit");
  redirect("/roles/edit?updated=1" as Route);
}
