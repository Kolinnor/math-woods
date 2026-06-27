import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { canSendMail, sendMail } from "@/lib/mail";
import { displayNameForUser } from "@/lib/user-display";

const EMAIL_VERIFICATION_MAX_AGE_MS = 1000 * 60 * 60 * 24;

export type EmailVerificationDelivery =
  | { sent: true }
  | { sent: false; reason: "missing-email" | "already-verified" | "not-configured" | "send-failed" };

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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, email: true, emailVerifiedAt: true }
  });

  if (!user?.email) return { sent: false, reason: "missing-email" } satisfies EmailVerificationDelivery;
  if (user.emailVerifiedAt) return { sent: false, reason: "already-verified" } satisfies EmailVerificationDelivery;
  if (!canSendMail()) return { sent: false, reason: "not-configured" } satisfies EmailVerificationDelivery;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_MAX_AGE_MS);

  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } }),
    prisma.emailVerificationToken.create({
      data: {
        tokenHash: tokenHash(token),
        userId: user.id,
        email: user.email,
        expiresAt
      }
    })
  ]);

  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: user.email,
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

export async function verifyEmailToken(token: string) {
  const hashed = tokenHash(token);
  const verification = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashed },
    include: { user: true }
  });

  if (!verification || verification.expiresAt <= new Date()) {
    return { ok: false, reason: "expired" as const };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verification.userId },
      data: { emailVerifiedAt: new Date() }
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: verification.userId } })
  ]);

  return { ok: true, userId: verification.userId, username: verification.user.username };
}

export function mailStatusLabel() {
  return canSendMail() ? "Email delivery is configured." : "Email delivery is not configured yet.";
}
