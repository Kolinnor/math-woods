import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { parseMathLevel } from "@/lib/math-levels";
import { canModerate, isOwner } from "@/lib/roles";
import { ensureSlug } from "@/lib/slug";
import { normalizeDisplayName } from "@/lib/user-display";

const SESSION_COOKIE = "math_woods_session";
const LEGACY_SESSION_COOKIES = ["math_hills_session", "math_garden_session"];
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";
const DEVELOPMENT_AUTH_SECRET = "development-only-change-me";
const EXAMPLE_AUTH_SECRET = "change-this-to-a-long-random-string";

function authSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  const unsafeProductionSecret =
    !secret || secret === DEVELOPMENT_AUTH_SECRET || secret === EXAMPLE_AUTH_SECRET || secret.length < 32;

  if (process.env.NODE_ENV === "production" && unsafeProductionSecret) {
    throw new Error("AUTH_SECRET must be set to a unique random value of at least 32 characters in production.");
  }

  return secret || DEVELOPMENT_AUTH_SECRET;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("hex");
  return `pbkdf2:${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;

  const [scheme, iterationsRaw, salt, expectedHash] = storedHash.split(":");
  if (scheme !== "pbkdf2" || !iterationsRaw || !salt || !expectedHash) return false;

  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations)) return false;

  const actual = pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST);
  const expected = Buffer.from(expectedHash, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const getCurrentUser = cache(async function getCurrentUser() {
  const currentSession = await getCurrentSession();
  return currentSession?.user ?? null;
});

export const getCurrentSession = cache(async function getCurrentSession() {
  const store = await cookies();
  const tokens = [store.get(SESSION_COOKIE)?.value, ...LEGACY_SESSION_COOKIES.map((name) => store.get(name)?.value)].filter(
    (token): token is string => Boolean(token)
  );

  for (const token of tokens) {
    const tokenHash = hashSessionToken(token);
    if (!tokenHash) continue;

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    const now = new Date();
    if (!session || session.expiresAt <= now) continue;

    if (now.getTime() - session.lastSeenAt.getTime() >= LAST_SEEN_UPDATE_INTERVAL_MS) {
      await prisma.session.update({
        where: { id: session.id },
        data: { lastSeenAt: now }
      });
    }

    return session;
  }

  return null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireVerifiedUser() {
  const user = await requireUser();
  if (!user.emailVerifiedAt && !canModerate(user.role)) {
    redirect("/settings?verify=required");
  }
  return user;
}

export async function requireModerator() {
  const user = await requireUser();
  if (!canModerate(user.role)) redirect("/");
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (!isOwner(user.role)) redirect("/");
  return user;
}

export async function registerUser(
  displayNameInput: string,
  emailInput: string,
  password: string,
  mathLevelInput: FormDataEntryValue | string | null | undefined
) {
  const displayName = normalizeDisplayName(displayNameInput);
  const username = ensureSlug(displayName, "user");
  const email = emailInput.trim().toLowerCase();
  const mathLevel = parseMathLevel(mathLevelInput);

  if (username.length < 3) throw new Error("Username must be at least 3 characters.");
  if (!email.includes("@")) throw new Error("A valid email is required.");
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (!mathLevel) throw new Error("Please choose your mathematics level.");

  const user = await prisma.user.create({
    data: {
      username,
      displayName,
      email,
      mathLevel,
      passwordHash: hashPassword(password)
    }
  });

  await createSession(user.id);
  return user;
}

export async function signInWithPassword(identifierInput: string, password: string) {
  const identifier = identifierInput.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: identifier }, { email: identifier }]
    }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error("Invalid username/email or password.");
  }

  await createSession(user.id);
  return user;
}

export async function signOutUser() {
  const store = await cookies();
  const tokenHashes = [store.get(SESSION_COOKIE)?.value, ...LEGACY_SESSION_COOKIES.map((name) => store.get(name)?.value)]
    .map(hashSessionToken)
    .filter((tokenHash): tokenHash is string => Boolean(tokenHash));

  if (tokenHashes.length) {
    await prisma.session.deleteMany({ where: { tokenHash: { in: tokenHashes } } });
  }

  store.delete(SESSION_COOKIE);
  for (const name of LEGACY_SESSION_COOKIES) store.delete(name);
}

export async function updatePasswordForCurrentUser(currentPassword: string, newPassword: string) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!verifyPassword(currentPassword, session.user.passwordHash)) throw new Error("Current password is incorrect.");
  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: hashPassword(newPassword) }
    }),
    prisma.session.deleteMany({
      where: {
        userId: session.userId,
        id: { not: session.id }
      }
    })
  ]);
}

export async function revokeOtherSessionsForCurrentUser() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  await prisma.session.deleteMany({
    where: {
      userId: session.userId,
      id: { not: session.id }
    }
  });
}

async function createSession(userId: number) {
  const store = await cookies();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hashSessionToken(token)!,
      userId,
      expiresAt
    }
  });

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  for (const name of LEGACY_SESSION_COOKIES) store.delete(name);
}

function hashSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  return createHmac("sha256", authSecret()).update(token).digest("hex");
}
