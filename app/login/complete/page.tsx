import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import {
  completeOAuthSignupAction,
  linkOAuthToExistingAccountAction
} from "@/lib/actions/oauth-actions";
import { prisma } from "@/lib/db";
import { MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { oauthProviderLabel, pendingOAuthAttempt } from "@/lib/oauth";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/user-display";

export const dynamic = "force-dynamic";

function errorMessage(reason?: string) {
  if (reason === "invalid") return "The information could not be verified. Please try again.";
  if (reason === "account-used") return "This external account is already connected.";
  if (reason === "email-used") return "A Math Woods account already uses this email. Connect it below instead.";
  if (reason === "expired") return "This sign-in attempt expired. Please start again.";
  if (reason === "rate-limited") return "Too many attempts. Please wait a moment and try again.";
  return null;
}

export default async function CompleteOAuthPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const attempt = await pendingOAuthAttempt();
  const params: { error?: string } = searchParams ? await searchParams : {};
  const error = errorMessage(params.error);
  if (!attempt?.providerAccountId) {
    return (
      <ForestPageLayout title="Complete sign in" heroImage="/art/morning-in-a-pine-forest.jpg" heroAlt="Ivan Shishkin, Morning in a Pine Forest">
        <section className="panel grid gap-4 p-5">
          <h1 className="text-xl font-semibold">Sign-in attempt expired</h1>
          <p className="muted">Return to the login page and try again.</p>
          <Link href="/login" className="button">Back to login</Link>
        </section>
      </ForestPageLayout>
    );
  }

  const existingUser = attempt.providerEmailVerified && attempt.providerEmail
    ? await prisma.user.findFirst({
        where: { email: attempt.providerEmail, deletedAt: null },
        select: { id: true, username: true, displayName: true, passwordHash: true }
      })
    : null;
  const providerLabel = oauthProviderLabel(attempt.provider);

  return (
    <ForestPageLayout
      title="Complete sign in"
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      description={`Finish connecting ${providerLabel} to Math Woods.`}
      workspaceClassName="forest-page-workspace-narrow"
    >
      {error && <p className="quality-banner quality-needs-work mb-4">{error}</p>}
      {existingUser ? (
        <section className="panel grid gap-4 p-5">
          <div>
            <h1 className="text-xl font-semibold">Connect your existing account</h1>
            <p className="muted mt-1 text-sm">
              A Math Woods account already uses <strong>{attempt.providerEmail}</strong>. Confirm its password once to connect {providerLabel}.
            </p>
          </div>
          {existingUser.passwordHash ? (
            <form action={linkOAuthToExistingAccountAction} className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium">Current Math Woods password</span>
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button type="submit">Connect {providerLabel}</button>
            </form>
          ) : (
            <div className="grid gap-3">
              <p className="muted text-sm">
                This account has no password. Sign in with one of its existing connected accounts, then add {providerLabel} from Settings.
              </p>
              <Link href="/login" className="button secondary">Back to login</Link>
            </div>
          )}
        </section>
      ) : (
        <section className="panel grid gap-4 p-5">
          <div>
            <h1 className="text-xl font-semibold">Create your Math Woods profile</h1>
            <p className="muted mt-1 text-sm">{providerLabel} confirmed your identity. Choose how you will appear on Math Woods.</p>
          </div>
          <form action={completeOAuthSignupAction} className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Profile name</span>
              <input
                name="displayName"
                defaultValue={attempt.providerDisplayName ?? ""}
                minLength={2}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Email</span>
              <input
                name="email"
                type="email"
                defaultValue={attempt.providerEmail ?? ""}
                readOnly={attempt.providerEmailVerified && Boolean(attempt.providerEmail)}
                required
              />
              {!attempt.providerEmailVerified && (
                <small className="muted">We will send a verification email before contributions are enabled.</small>
              )}
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Mathematics level</span>
              <select name="mathLevel" required defaultValue="">
                <option value="" disabled>Choose your level</option>
                {MATH_LEVEL_OPTIONS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
              </select>
            </label>
            <button type="submit">Create account with {providerLabel}</button>
          </form>
        </section>
      )}
    </ForestPageLayout>
  );
}
