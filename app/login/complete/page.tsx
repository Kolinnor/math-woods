import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import {
  completeOAuthSignupAction,
  linkOAuthToExistingAccountAction
} from "@/lib/actions/oauth-actions";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { oauthProviderLabel, pendingOAuthAttempt } from "@/lib/oauth";
import { USER_DISCOVERY_SOURCES } from "@/lib/user-discovery-source";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/user-display";

export const dynamic = "force-dynamic";

function errorMessage(reason: string | undefined, messages: {
  invalid: string;
  accountUsed: string;
  emailUsed: string;
  expired: string;
  rateLimited: string;
}) {
  if (reason === "invalid") return messages.invalid;
  if (reason === "account-used") return messages.accountUsed;
  if (reason === "email-used") return messages.emailUsed;
  if (reason === "expired") return messages.expired;
  if (reason === "rate-limited") return messages.rateLimited;
  return null;
}

export default async function CompleteOAuthPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const attempt = await pendingOAuthAttempt();
  const t = await getTranslations();
  const params: { error?: string } = searchParams ? await searchParams : {};
  const complete = t.auth.complete;
  const error = errorMessage(params.error, complete);
  if (!attempt?.providerAccountId) {
    return (
      <ForestPageLayout title={complete.title} heroImage="/art/morning-in-a-pine-forest.jpg" heroAlt="Ivan Shishkin, Morning in a Pine Forest">
        <section className="panel grid gap-4 p-5">
          <h1 className="text-xl font-semibold">{complete.expiredTitle}</h1>
          <p className="muted">{complete.expiredHelp}</p>
          <Link href="/login" className="button">{complete.backToLogin}</Link>
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
      title={complete.title}
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      description={complete.description(providerLabel)}
      workspaceClassName="forest-page-workspace-narrow"
    >
      {error && <p className="quality-banner quality-needs-work mb-4">{error}</p>}
      {existingUser ? (
        <section className="panel grid gap-4 p-5">
          <div>
            <h1 className="text-xl font-semibold">{complete.connectExisting}</h1>
            <p className="muted mt-1 text-sm">
              {complete.existingAccountHelp(attempt.providerEmail ?? "", providerLabel)}
            </p>
          </div>
          {existingUser.passwordHash ? (
            <form action={linkOAuthToExistingAccountAction} className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium">{complete.currentPassword}</span>
                <input name="password" type="password" autoComplete="current-password" required />
              </label>
              <button type="submit">{complete.connectProvider(providerLabel)}</button>
            </form>
          ) : (
            <div className="grid gap-3">
              <p className="muted text-sm">
                {complete.noPasswordHelp(providerLabel)}
              </p>
              <Link href="/login" className="button secondary">{complete.backToLogin}</Link>
            </div>
          )}
        </section>
      ) : (
        <section className="panel grid gap-4 p-5">
          <div>
            <h1 className="text-xl font-semibold">{complete.createProfile}</h1>
            <p className="muted mt-1 text-sm">{complete.identityConfirmed(providerLabel)}</p>
          </div>
          <form action={completeOAuthSignupAction} className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t.auth.profileName}</span>
              <input
                name="displayName"
                defaultValue={attempt.providerDisplayName ?? ""}
                minLength={2}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                required
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t.auth.email}</span>
              <input
                name="email"
                type="email"
                defaultValue={attempt.providerEmail ?? ""}
                readOnly={attempt.providerEmailVerified && Boolean(attempt.providerEmail)}
                required
              />
              {!attempt.providerEmailVerified && (
                <small className="muted">{complete.unverifiedEmailHelp}</small>
              )}
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{complete.mathematicsLevel}</span>
              <select name="mathLevel" required defaultValue="">
                <option value="" disabled>{t.auth.chooseLevel}</option>
                {MATH_LEVEL_OPTIONS.map((level) => <option key={level.value} value={level.value}>{t.auth.mathLevels[level.value]}</option>)}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t.profile.discoverySourceQuestion}</span>
              <select name="discoverySource" required defaultValue="">
                <option value="" disabled>{t.profile.discoverySourcePlaceholder}</option>
                {USER_DISCOVERY_SOURCES.map((source) => (
                  <option key={source} value={source}>{t.profile.discoverySources[source]}</option>
                ))}
              </select>
              <small className="muted">{t.profile.discoverySourceHelp}</small>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{t.profile.discoverySourceDetail}</span>
              <input
                name="discoverySourceDetail"
                maxLength={240}
                placeholder={t.profile.discoverySourceDetailPlaceholder}
              />
            </label>
            <button type="submit">{complete.createWithProvider(providerLabel)}</button>
          </form>
        </section>
      )}
    </ForestPageLayout>
  );
}
