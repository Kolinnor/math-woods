import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canSendMail, sendMail } from "@/lib/mail";
import { displayNameForUser } from "@/lib/user-display";

const EMAIL_VERIFICATION_MAX_AGE_MS = 1000 * 60 * 60 * 24;

export type EmailVerificationDelivery =
  | { sent: true }
  | { sent: false; reason: "missing-email" | "already-verified" | "not-configured" | "send-failed" };

export type EmailChangeDelivery =
  | { sent: true }
  | { sent: false; reason: "missing-user" | "same-email" | "email-in-use" | "not-configured" | "send-failed" };

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl() {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = process.env.APP_DOMAIN?.trim();
  return domain ? `https://${domain}` : "http://localhost:3000";
}

export async function createAndSendEmailVerification(userId: number) {
  const [user, pendingVerification] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, email: true, emailVerifiedAt: true }
    }),
    prisma.emailVerificationToken.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { email: true }
    })
  ]);

  if (!user?.email) return { sent: false, reason: "missing-email" } satisfies EmailVerificationDelivery;
  if (user.emailVerifiedAt) return { sent: false, reason: "already-verified" } satisfies EmailVerificationDelivery;
  if (!canSendMail()) return { sent: false, reason: "not-configured" } satisfies EmailVerificationDelivery;
  const targetEmail = pendingVerification?.email.trim().toLowerCase() || user.email;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_MAX_AGE_MS);

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.create({
      data: {
        tokenHash: tokenHash(token),
        userId: user.id,
        email: targetEmail,
        expiresAt
      }
    })
  ]);

  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: targetEmail,
      subject: "Verify your Math Woods email",
      text: [
        `Hi ${displayNameForUser(user)},`,
        "",
        "Please verify your Math Woods email address in order to access all functionalities:",
        "",
        link,
        "",
        "This link expires in 24 hours.",
        "",
        "If you did not create a Math Woods account, you can ignore this email."
      ].join("\n")
    });
  } catch (error) {
    console.error("Email verification delivery failed", error);
    return { sent: false, reason: "send-failed" } satisfies EmailVerificationDelivery;
  }

  return { sent: true } satisfies EmailVerificationDelivery;
}

export async function createAndSendEmailChangeVerification(userId: number, requestedEmail: string) {
  const email = requestedEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, email: true }
  });

  if (!user) return { sent: false, reason: "missing-user" } satisfies EmailChangeDelivery;
  if (user.email?.toLowerCase() === email) {
    return { sent: false, reason: "same-email" } satisfies EmailChangeDelivery;
  }

  const emailOwner = await prisma.user.findFirst({
    where: {
      id: { not: user.id },
      email: { equals: email, mode: "insensitive" },
      deletedAt: null
    },
    select: { id: true }
  });
  if (emailOwner) return { sent: false, reason: "email-in-use" } satisfies EmailChangeDelivery;
  if (!canSendMail()) return { sent: false, reason: "not-configured" } satisfies EmailChangeDelivery;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_MAX_AGE_MS);

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.create({
      data: {
        tokenHash: tokenHash(token),
        userId: user.id,
        email,
        expiresAt
      }
    })
  ]);

  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: email,
      subject: "Confirm your new Math Woods email",
      text: [
        `Hi ${displayNameForUser(user)},`,
        "",
        "Please confirm this new email address for your Math Woods account:",
        "",
        link,
        "",
        "Your current email address will remain active until you open this link.",
        "This link expires in 24 hours.",
        "",
        "If you did not request this change, you can ignore this email."
      ].join("\n")
    });
  } catch (error) {
    console.error("Email change verification delivery failed", error);
    return { sent: false, reason: "send-failed" } satisfies EmailChangeDelivery;
  }

  return { sent: true } satisfies EmailChangeDelivery;
}

export async function verifyEmailToken(token: string) {
  const hashed = tokenHash(token);
  const verification = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashed },
    include: { user: true }
  });

  if (!verification || verification.expiresAt <= new Date()) {
    return { ok: false, reason: "expired" as const };
  }

  const nextEmail = verification.email.trim().toLowerCase();
  const emailOwner = await prisma.user.findFirst({
    where: {
      id: { not: verification.userId },
      email: { equals: nextEmail, mode: "insensitive" },
      deletedAt: null
    },
    select: { id: true }
  });
  if (emailOwner) return { ok: false, reason: "email-in-use" as const };

  const previousEmail = verification.user.email;
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verification.userId },
        data: { email: nextEmail, emailVerifiedAt: new Date() }
      }),
      prisma.emailVerificationToken.deleteMany({ where: { userId: verification.userId } })
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "email-in-use" as const };
    }
    throw error;
  }

  const emailChanged = Boolean(previousEmail && previousEmail.toLowerCase() !== nextEmail);
  if (emailChanged && previousEmail && canSendMail()) {
    try {
      await sendMail({
        to: previousEmail,
        subject: "Your Math Woods email was changed",
        text: [
          `Hi ${displayNameForUser(verification.user)},`,
          "",
          `The email address for your Math Woods account was changed to ${nextEmail}.`,
          "",
          "If you did not make this change, please contact the Math Woods team."
        ].join("\n")
      });
    } catch (error) {
      console.error("Previous email change notice delivery failed", error);
    }
  }

  return { ok: true, userId: verification.userId, username: verification.user.username, emailChanged };
}

export function mailStatusLabel() {
  return canSendMail() ? "Email delivery is configured." : "Email delivery is not configured yet.";
}
