import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canSendMail, sendMail } from "@/lib/mail";
import { displayNameForUser } from "@/lib/user-display";
import { normalizeUsernameLookup, usernameLookupFilter } from "@/lib/usernames";

const PASSWORD_RESET_MAX_AGE_MS = 1000 * 60 * 60;

export type PasswordResetDelivery =
  | { sent: true }
  | { sent: false; reason: "missing-account" | "no-password" | "not-configured" | "send-failed" };

export type PasswordResetTokenCheck = { ok: true } | { ok: false; reason: "expired" };

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; reason: "expired" | "identifier-mismatch" | "weak-password" };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl() {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = process.env.APP_DOMAIN?.trim();
  return domain ? `https://${domain}` : "http://localhost:3000";
}

export async function createAndSendPasswordReset(identifierInput: string) {
  const identifier = identifierInput.trim();
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { username: usernameLookupFilter(identifier) },
        { email: { equals: identifier, mode: "insensitive" } }
      ]
    },
    select: { id: true, username: true, displayName: true, email: true, passwordHash: true }
  });

  if (!user?.email) return { sent: false, reason: "missing-account" } satisfies PasswordResetDelivery;
  if (!user.passwordHash) return { sent: false, reason: "no-password" } satisfies PasswordResetDelivery;
  if (!canSendMail()) return { sent: false, reason: "not-configured" } satisfies PasswordResetDelivery;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_MAX_AGE_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        tokenHash: tokenHash(token),
        userId: user.id,
        expiresAt
      }
    })
  ]);

  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: user.email,
      subject: "Reset your Math Woods password",
      text: [
        `Hi ${displayNameForUser(user)},`,
        "",
        "We received a request to reset your Math Woods password. Click the link below to choose a new one:",
        "",
        link,
        "",
        "This link expires in 1 hour.",
        "",
        "If you did not request this, you can safely ignore this email — your password will not change."
      ].join("\n")
    });
  } catch (error) {
    console.error("Password reset email delivery failed", error);
    return { sent: false, reason: "send-failed" } satisfies PasswordResetDelivery;
  }

  return { sent: true } satisfies PasswordResetDelivery;
}

export async function checkPasswordResetToken(token: string): Promise<PasswordResetTokenCheck> {
  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: { expiresAt: true }
  });

  if (!reset || reset.expiresAt <= new Date()) return { ok: false, reason: "expired" };
  return { ok: true };
}

export async function resetPasswordWithToken(
  token: string,
  identifierInput: string,
  newPassword: string
): Promise<PasswordResetResult> {
  const identifier = identifierInput.trim();
  const reset = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true }
  });

  if (!reset || reset.expiresAt <= new Date()) return { ok: false, reason: "expired" };

  const identifierMatches =
    normalizeUsernameLookup(reset.user.username) === normalizeUsernameLookup(identifier) ||
    (Boolean(reset.user.email) && reset.user.email!.toLowerCase() === identifier.toLowerCase());
  if (!identifierMatches) return { ok: false, reason: "identifier-mismatch" };

  if (newPassword.length < 8) return { ok: false, reason: "weak-password" };

  const resetApplied = await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.deleteMany({
      where: {
        id: reset.id,
        tokenHash: tokenHash(token),
        expiresAt: { gt: new Date() }
      }
    });
    if (consumed.count !== 1) return false;

    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash: hashPassword(newPassword) }
    });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId } });
    return true;
  });

  if (!resetApplied) return { ok: false, reason: "expired" };

  return { ok: true };
}
