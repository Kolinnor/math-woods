"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registerUser, signInWithPassword, signOutUser } from "@/lib/auth";
import { boundedText } from "@/lib/content-limits";
import { createAndSendEmailVerification } from "@/lib/email-verification";
import { safeReturnTo } from "@/lib/oauth-utils";
import { createAndSendPasswordReset, resetPasswordWithToken } from "@/lib/password-reset";
import { assertRateLimit } from "@/lib/rate-limit";
import { currentClientAddress } from "@/lib/request-context";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

function prismaErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
}

export async function loginAction(formData: FormData) {
  const identifier = boundedText(formData.get("identifier"), 320, "Identifier");
  const password = boundedText(formData.get("password"), 512, "Password", { trim: false });
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? ""));
  const clientAddress = await currentClientAddress();
  const normalizedIdentifier = identifier.toLowerCase();

  try {
    await Promise.all([
      assertRateLimit(`login:pair:${clientAddress}:${normalizedIdentifier}`, 8, 60_000),
      assertRateLimit(`login:account:${normalizedIdentifier}`, 30, 15 * 60_000),
      assertRateLimit(`login:ip:${clientAddress}`, 60, 15 * 60_000)
    ]);
    await signInWithPassword(identifier, password);
  } catch (error) {
    const reason = errorMessage(error).startsWith("Too many requests") ? "rate-limited" : "invalid";
    redirect(`/login?loginError=${reason}&returnTo=${encodeURIComponent(returnTo)}` as never);
  }

  redirect(returnTo as never);
}

export async function registerAction(formData: FormData) {
  const displayName = boundedText(formData.get("displayName"), 80, "Profile name");
  const email = boundedText(formData.get("email"), 320, "Email");
  const password = boundedText(formData.get("password"), 512, "Password", { trim: false });
  const mathLevel = formData.get("mathLevel");
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? ""));
  const hasCustomReturnTo = returnTo !== "/";
  const clientAddress = await currentClientAddress();

  let user;
  try {
    await Promise.all([
      assertRateLimit(`register:email:${email.toLowerCase()}`, 3, 60 * 60_000),
      assertRateLimit(`register:ip:${clientAddress}`, 10, 60 * 60_000)
    ]);
    user = await registerUser(
      displayName,
      email,
      password,
      mathLevel
    );
  } catch (error) {
    const reason = errorMessage(error).startsWith("Too many requests")
      ? "rate-limited"
      : prismaErrorCode(error) === "P2002" || errorMessage(error).includes("already in use")
        ? "already-used"
        : "invalid";
    redirect(`/login?registerError=${reason}&returnTo=${encodeURIComponent(returnTo)}` as never);
  }

  const delivery = await createAndSendEmailVerification(user.id);
  if (hasCustomReturnTo) redirect(returnTo as never);
  redirect(delivery.sent ? "/settings?verify=sent" : `/settings?verify=${delivery.reason}`);
}

export async function requestPasswordResetAction(formData: FormData) {
  const identifier = boundedText(formData.get("identifier"), 320, "Identifier");
  const clientAddress = await currentClientAddress();
  const normalizedIdentifier = identifier.toLowerCase();

  try {
    await Promise.all([
      assertRateLimit(`password-reset:identifier:${normalizedIdentifier}`, 3, 60 * 60_000),
      assertRateLimit(`password-reset:ip:${clientAddress}`, 10, 60 * 60_000)
    ]);
  } catch {
    redirect("/forgot-password?resetRequest=rate-limited" as never);
  }

  const delivery = await createAndSendPasswordReset(identifier);
  if (!delivery.sent && delivery.reason === "not-configured") {
    redirect("/forgot-password?resetRequest=not-configured" as never);
  }

  redirect("/forgot-password?resetRequest=sent" as never);
}

export async function resetPasswordAction(formData: FormData) {
  const token = boundedText(formData.get("token"), 512, "Token", { trim: false });
  const identifier = boundedText(formData.get("identifier"), 320, "Identifier");
  const password = boundedText(formData.get("password"), 512, "Password", { trim: false });
  const confirmPassword = boundedText(formData.get("confirmPassword"), 512, "Confirm password", { trim: false });
  const tokenParam = `token=${encodeURIComponent(token)}`;

  if (password !== confirmPassword) {
    redirect(`/reset-password?${tokenParam}&resetError=mismatch` as never);
  }

  const clientAddress = await currentClientAddress();
  try {
    await assertRateLimit(`password-reset:submit:${clientAddress}`, 20, 15 * 60_000);
  } catch {
    redirect(`/reset-password?${tokenParam}&resetError=rate-limited` as never);
  }

  const result = await resetPasswordWithToken(token, identifier, password);
  if (!result.ok) {
    redirect(`/reset-password?${tokenParam}&resetError=${result.reason}` as never);
  }

  redirect("/login?passwordReset=1" as never);
}

export async function logoutAction() {
  await signOutUser();
  revalidatePath("/", "layout");
  redirect("/");
}
