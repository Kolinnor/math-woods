"use server";

import { randomBytes } from "node:crypto";
import { ExternalAuthProvider, NotificationType } from "@prisma/client";
import { redirect } from "next/navigation";
import { createSession, requireUser, setPasswordForCurrentUser, verifyPassword } from "@/lib/auth";
import { boundedText } from "@/lib/content-limits";
import { prisma } from "@/lib/db";
import { createAndSendEmailVerification } from "@/lib/email-verification";
import { parseMathLevel } from "@/lib/math-levels";
import { clearOAuthCookie, pendingOAuthAttempt } from "@/lib/oauth";
import { notifyOwnerOfSiteActivity } from "@/lib/notifications";
import { assertRateLimit } from "@/lib/rate-limit";
import { ensureSlug } from "@/lib/slug";
import { displayNameForUser, normalizeDisplayName } from "@/lib/user-display";

async function availableUsername(displayName: string) {
  const base = ensureSlug(displayName, "user");
  const existing = await prisma.user.findUnique({ where: { username: base }, select: { id: true } });
  return existing ? `${base}-${randomBytes(3).toString("hex")}` : base;
}

function oauthFailure(reason: "expired" | "invalid" | "account-used" | "email-used" | "rate-limited"): never {
  redirect(`/login/complete?error=${reason}` as never);
}

export async function completeOAuthSignupAction(formData: FormData) {
  const attempt = await pendingOAuthAttempt();
  if (!attempt?.providerAccountId) oauthFailure("expired");
  try {
    await assertRateLimit(`oauth-signup:${attempt.tokenHash}`, 5, 60_000);
  } catch {
    oauthFailure("rate-limited");
  }

  let displayName: string;
  let suppliedEmail: string;
  try {
    displayName = normalizeDisplayName(boundedText(formData.get("displayName"), 80, "Profile name"));
    suppliedEmail = boundedText(formData.get("email"), 320, "Email").trim().toLowerCase();
  } catch {
    oauthFailure("invalid");
  }
  const email = attempt.providerEmailVerified && attempt.providerEmail
    ? attempt.providerEmail
    : suppliedEmail;
  const mathLevel = parseMathLevel(formData.get("mathLevel"));
  if (!email.includes("@") || !mathLevel) oauthFailure("invalid");

  const [emailOwner, username] = await Promise.all([
    prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true } }),
    availableUsername(displayName)
  ]);
  if (emailOwner) oauthFailure("email-used");

  let user: Awaited<ReturnType<typeof prisma.user.create>>;
  try {
    user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          displayName,
          email,
          emailVerifiedAt: attempt.providerEmailVerified && attempt.providerEmail === email ? new Date() : null,
          mathLevel,
          passwordHash: null
        }
      });
      await tx.externalIdentity.create({
        data: {
          userId: created.id,
          provider: attempt.provider,
          providerAccountId: attempt.providerAccountId!,
          providerEmail: attempt.providerEmail
        }
      });
      await tx.oAuthAttempt.delete({ where: { id: attempt.id } });
      return created;
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    oauthFailure(code === "P2002" ? "account-used" : "invalid");
  }

  await clearOAuthCookie();
  await createSession(user.id);
  await notifyOwnerOfSiteActivity({
    actor: user,
    type: NotificationType.USER_REGISTERED,
    title: "New account created",
    body: `${displayNameForUser(user)} joined Math Woods.`,
    href: `/profile/${user.username}`
  });
  if (!user.emailVerifiedAt) await createAndSendEmailVerification(user.id);
  redirect(attempt.returnTo as never);
}

export async function linkOAuthToExistingAccountAction(formData: FormData) {
  const attempt = await pendingOAuthAttempt();
  if (!attempt?.providerAccountId || !attempt.providerEmail || !attempt.providerEmailVerified) oauthFailure("expired");
  try {
    await assertRateLimit(`oauth-link-existing:${attempt.tokenHash}`, 5, 60_000);
  } catch {
    oauthFailure("rate-limited");
  }
  let password: string;
  try {
    password = boundedText(formData.get("password"), 512, "Password", { trim: false });
  } catch {
    oauthFailure("invalid");
  }
  const user = await prisma.user.findFirst({
    where: { email: attempt.providerEmail, deletedAt: null },
    select: { id: true, passwordHash: true }
  });
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) oauthFailure("invalid");

  try {
    await prisma.$transaction([
      prisma.externalIdentity.create({
        data: {
          userId: user.id,
          provider: attempt.provider,
          providerAccountId: attempt.providerAccountId,
          providerEmail: attempt.providerEmail
        }
      }),
      prisma.oAuthAttempt.delete({ where: { id: attempt.id } })
    ]);
  } catch {
    oauthFailure("account-used");
  }
  await clearOAuthCookie();
  await createSession(user.id);
  redirect(attempt.returnTo as never);
}

export async function disconnectExternalIdentityAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`oauth-disconnect:${user.id}`, 10, 60_000);
  const providerValue = String(formData.get("provider") ?? "");
  const provider = providerValue === ExternalAuthProvider.GOOGLE || providerValue === ExternalAuthProvider.ORCID
    ? providerValue
    : null;
  if (!provider) redirect("/settings?oauth=failed");

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, _count: { select: { externalIdentities: true } } }
  });
  if (!account?.passwordHash && account?._count.externalIdentities === 1) {
    redirect("/settings?oauth=last-method");
  }
  await prisma.externalIdentity.deleteMany({ where: { userId: user.id, provider } });
  redirect("/settings?oauth=disconnected");
}

export async function setInitialPasswordAction(formData: FormData) {
  const user = await requireUser();
  await assertRateLimit(`set-password:${user.id}`, 5, 60_000);
  const password = boundedText(formData.get("newPassword"), 512, "New password", { trim: false });
  await setPasswordForCurrentUser(password);
  redirect("/settings?updated=password");
}
