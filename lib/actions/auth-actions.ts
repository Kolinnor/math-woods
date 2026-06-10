"use server";

import { redirect } from "next/navigation";
import { registerUser, signInWithPassword, signOutUser } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";

export async function loginAction(formData: FormData) {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  await assertRateLimit(`login:${identifier.toLowerCase()}`, 8, 60_000);
  await signInWithPassword(identifier, password);
  redirect("/");
}

export async function registerAction(formData: FormData) {
  const username = String(formData.get("username") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  await assertRateLimit(`register:${email.toLowerCase()}`, 3, 60_000);
  await registerUser(username, email, password);
  redirect("/");
}

export async function logoutAction() {
  await signOutUser();
  redirect("/");
}
