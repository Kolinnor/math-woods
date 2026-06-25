"use server";

import { redirect } from "next/navigation";
import { registerUser, signInWithPassword, signOutUser } from "@/lib/auth";
import { boundedText } from "@/lib/content-limits";
import { createAndSendEmailVerification } from "@/lib/email-verification";
import { assertRateLimit } from "@/lib/rate-limit";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function prismaErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}

export async function loginAction(formData: FormData) {
  const identifier = boundedText(formData.get("identifier"), 320, "Identifier");
  const password = boundedText(formData.get("password"), 512, "Password", { trim: false });

  try {
    await assertRateLimit(`login:${identifier.toLowerCase()}`, 8, 60_000);
    await signInWithPassword(identifier, password);
  } catch (error) {
    const reason = errorMessage(error).startsWith("Too many requests") ? "rate-limited" : "invalid";
    redirect(`/login?loginError=${reason}`);
  }

  redirect("/");
}

export async function registerAction(formData: FormData) {
  const displayName = boundedText(formData.get("displayName"), 80, "Profile name");
  const email = boundedText(formData.get("email"), 320, "Email");
  const password = boundedText(formData.get("password"), 512, "Password", { trim: false });
  const mathLevel = formData.get("mathLevel");

  let user;
  try {
    await assertRateLimit(`register:${email.toLowerCase()}`, 3, 60_000);
    user = await registerUser(displayName, email, password, mathLevel);
  } catch (error) {
    const reason = errorMessage(error).startsWith("Too many requests")
      ? "rate-limited"
      : prismaErrorCode(error) === "P2002"
        ? "already-used"
        : "invalid";
    redirect(`/login?registerError=${reason}`);
  }

  const delivery = await createAndSendEmailVerification(user.id);
  redirect(delivery.sent ? "/settings?verify=sent" : `/settings?verify=${delivery.reason}`);
}

export async function logoutAction() {
  await signOutUser();
  redirect("/");
}
