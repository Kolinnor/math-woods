"use server";

import { redirect } from "next/navigation";
import { registerUser, signInWithPassword, signOutUser } from "@/lib/auth";
import { boundedText } from "@/lib/content-limits";
import { createAndSendEmailVerification } from "@/lib/email-verification";
import { assertRateLimit } from "@/lib/rate-limit";

export async function loginAction(formData: FormData) {
  const identifier = boundedText(formData.get("identifier"), 320, "Identifier");
  const password = boundedText(formData.get("password"), 512, "Password", { trim: false });
  await assertRateLimit(`login:${identifier.toLowerCase()}`, 8, 60_000);
  await signInWithPassword(identifier, password);
  redirect("/");
}

export async function registerAction(formData: FormData) {
  const displayName = boundedText(formData.get("displayName"), 80, "Profile name");
  const email = boundedText(formData.get("email"), 320, "Email");
  const password = boundedText(formData.get("password"), 512, "Password", { trim: false });
  const mathLevel = formData.get("mathLevel");
  await assertRateLimit(`register:${email.toLowerCase()}`, 3, 60_000);
  const user = await registerUser(displayName, email, password, mathLevel);
  const delivery = await createAndSendEmailVerification(user.id);
  redirect(delivery.sent ? "/settings?verify=sent" : `/settings?verify=${delivery.reason}`);
}

export async function logoutAction() {
  await signOutUser();
  redirect("/");
}
