import { createHash, randomBytes } from "node:crypto";
import { ExternalAuthProvider } from "@prisma/client";
import { cookies } from "next/headers";
import * as oidc from "openid-client";
import { createSession, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseOAuthProvider, safeReturnTo, type OAuthProviderKey } from "@/lib/oauth-utils";

export { parseOAuthProvider, safeReturnTo } from "@/lib/oauth-utils";
export type { OAuthProviderKey } from "@/lib/oauth-utils";

const OAUTH_COOKIE = "math_woods_oauth";
const OAUTH_ATTEMPT_MAX_AGE_SECONDS = 10 * 60;

type ProviderDefinition = {
  key: OAuthProviderKey;
  provider: ExternalAuthProvider;
  label: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  prompt?: string;
};

function providerDefinition(key: OAuthProviderKey): ProviderDefinition {
  if (key === "google") {
    return {
      key,
      provider: ExternalAuthProvider.GOOGLE,
      label: "Google",
      issuer: "https://accounts.google.com",
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "",
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "",
      scope: "openid email profile",
      prompt: "select_account"
    };
  }
  return {
    key,
    provider: ExternalAuthProvider.ORCID,
    label: "ORCID",
    issuer: "https://orcid.org",
    clientId: process.env.ORCID_OAUTH_CLIENT_ID?.trim() ?? "",
    clientSecret: process.env.ORCID_OAUTH_CLIENT_SECRET?.trim() ?? "",
    scope: "openid"
  };
}

export function configuredOAuthProviders() {
  return (["google", "orcid"] as const)
    .map(providerDefinition)
    .filter((provider) => provider.clientId && provider.clientSecret)
    .map(({ key, provider, label }) => ({ key, provider, label }));
}

export function oauthProviderLabel(provider: ExternalAuthProvider) {
  return provider === ExternalAuthProvider.GOOGLE ? "Google" : "ORCID";
}

export function oauthProviderKey(provider: ExternalAuthProvider): OAuthProviderKey {
  return provider === ExternalAuthProvider.GOOGLE ? "google" : "orcid";
}

function configuredProvider(key: OAuthProviderKey) {
  const provider = providerDefinition(key);
  if (!provider.clientId || !provider.clientSecret) throw new Error("OAuth provider is not configured.");
  return provider;
}

function appOrigin() {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = process.env.APP_DOMAIN?.trim();
  return domain ? `https://${domain}` : "http://localhost:3000";
}

function callbackUrl(provider: OAuthProviderKey) {
  return `${appOrigin()}/api/auth/${provider}/callback`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const configurationCache = new Map<OAuthProviderKey, Promise<oidc.Configuration>>();

function providerConfiguration(provider: ProviderDefinition) {
  let configuration = configurationCache.get(provider.key);
  if (!configuration) {
    configuration = oidc.discovery(new URL(provider.issuer), provider.clientId, provider.clientSecret);
    configurationCache.set(provider.key, configuration);
  }
  return configuration;
}

async function setOAuthCookie(token: string) {
  const store = await cookies();
  store.set(OAUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_ATTEMPT_MAX_AGE_SECONDS
  });
}

export async function clearOAuthCookie() {
  const store = await cookies();
  store.delete(OAUTH_COOKIE);
}

export async function beginOAuth(
  providerKey: OAuthProviderKey,
  options: { mode: "login" | "link"; returnTo?: string | null }
) {
  const provider = configuredProvider(providerKey);
  const currentUser = options.mode === "link" ? await getCurrentUser() : null;
  if (options.mode === "link" && !currentUser) throw new Error("Sign in before connecting an account.");

  const [configuration, codeVerifier] = await Promise.all([
    providerConfiguration(provider),
    Promise.resolve(oidc.randomPKCECodeVerifier())
  ]);
  const [codeChallenge, state, nonce] = await Promise.all([
    oidc.calculatePKCECodeChallenge(codeVerifier),
    Promise.resolve(oidc.randomState()),
    Promise.resolve(oidc.randomNonce())
  ]);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_ATTEMPT_MAX_AGE_SECONDS * 1000);

  await prisma.$transaction([
    prisma.oAuthAttempt.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
    prisma.oAuthAttempt.create({
      data: {
        tokenHash: hashToken(token),
        provider: provider.provider,
        codeVerifier,
        state,
        nonce,
        returnTo: safeReturnTo(options.returnTo, options.mode === "link" ? "/settings" : "/"),
        linkUserId: currentUser?.id ?? null,
        expiresAt
      }
    })
  ]);
  await setOAuthCookie(token);

  const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
    redirect_uri: callbackUrl(providerKey),
    scope: provider.scope,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    ...(provider.prompt ? { prompt: provider.prompt } : {})
  });
  return authorizationUrl;
}

async function attemptFromCookie(provider?: ExternalAuthProvider) {
  const token = (await cookies()).get(OAUTH_COOKIE)?.value;
  if (!token) return null;
  return prisma.oAuthAttempt.findFirst({
    where: {
      tokenHash: hashToken(token),
      expiresAt: { gt: new Date() },
      ...(provider ? { provider } : {})
    }
  });
}

export async function pendingOAuthAttempt() {
  const attempt = await attemptFromCookie();
  return attempt?.providerAccountId ? attempt : null;
}

export async function finishOAuthCallback(providerKey: OAuthProviderKey, currentUrl: URL) {
  const provider = configuredProvider(providerKey);
  const attempt = await attemptFromCookie(provider.provider);
  if (!attempt) throw new Error("OAuth attempt expired.");
  if (attempt.providerAccountId) return "/login/complete";

  const configuration = await providerConfiguration(provider);
  const callback = new URL(callbackUrl(providerKey));
  callback.search = currentUrl.search;
  const tokens = await oidc.authorizationCodeGrant(configuration, callback, {
    pkceCodeVerifier: attempt.codeVerifier,
    expectedState: attempt.state,
    expectedNonce: attempt.nonce,
    idTokenExpected: true
  });
  const claims = tokens.claims();
  const subject = claims?.sub;
  if (!subject) throw new Error("The identity provider did not return an account identifier.");
  const userInfo = await oidc.fetchUserInfo(configuration, tokens.access_token, subject);
  const providerAccountId = String(userInfo.sub || subject);
  const providerEmail = typeof userInfo.email === "string" ? userInfo.email.trim().toLowerCase() : null;
  const providerEmailVerified = userInfo.email_verified === true;
  const providerDisplayName = typeof userInfo.name === "string" && userInfo.name.trim()
    ? userInfo.name.trim()
    : [userInfo.given_name, userInfo.family_name].filter((value) => typeof value === "string").join(" ").trim() || null;

  const identity = await prisma.externalIdentity.findUnique({
    where: { provider_providerAccountId: { provider: provider.provider, providerAccountId } },
    include: { user: true }
  });
  if (identity) {
    if (identity.user.deletedAt) throw new Error("This account is no longer active.");
    if (attempt.linkUserId && attempt.linkUserId !== identity.userId) {
      throw new Error("This external account is already connected to another Math Woods account.");
    }
    await prisma.oAuthAttempt.delete({ where: { id: attempt.id } });
    await clearOAuthCookie();
    await createSession(identity.userId);
    return attempt.returnTo;
  }

  if (attempt.linkUserId) {
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.id !== attempt.linkUserId) throw new Error("Your Math Woods session expired.");
    await prisma.$transaction([
      prisma.externalIdentity.create({
        data: {
          userId: currentUser.id,
          provider: provider.provider,
          providerAccountId,
          providerEmail
        }
      }),
      prisma.oAuthAttempt.delete({ where: { id: attempt.id } })
    ]);
    await clearOAuthCookie();
    return "/settings?oauth=connected";
  }

  await prisma.oAuthAttempt.update({
    where: { id: attempt.id },
    data: {
      providerAccountId,
      providerEmail,
      providerEmailVerified,
      providerDisplayName
    }
  });
  return "/login/complete";
}

export async function consumePendingOAuthAttempt(attemptId: number) {
  await prisma.oAuthAttempt.delete({ where: { id: attemptId } });
  await clearOAuthCookie();
}
