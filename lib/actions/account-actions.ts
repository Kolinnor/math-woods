"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, revokeOtherSessionsForCurrentUser, updatePasswordForCurrentUser } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  await assertRateLimit(`change-password:${user.id}`, 5, 60_000);
  await updatePasswordForCurrentUser(currentPassword, newPassword);
  revalidatePath("/settings");
  redirect("/settings?updated=password");
}

export async function revokeOtherSessionsAction() {
  const user = await requireUser();
  await assertRateLimit(`revoke-sessions:${user.id}`, 10, 60_000);
  await revokeOtherSessionsForCurrentUser();
  revalidatePath("/settings");
  redirect("/settings?updated=sessions");
}
