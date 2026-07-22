import Link from "next/link";
import { LogIn } from "lucide-react";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { loginAction, registerAction } from "@/lib/actions/auth-actions";
import { getTranslations } from "@/lib/i18n/server";
import { MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { configuredOAuthProviders, safeReturnTo } from "@/lib/oauth";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/user-display";

function loginErrorMessage(reason: string | undefined, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (reason === "rate-limited") return t.auth.errors.tooManySignIns;
  if (reason === "invalid") return t.auth.errors.invalidSignIn;
  return null;
}

function oauthErrorMessage(reason: string | undefined) {
  if (reason === "unavailable") return "This sign-in provider is not available right now.";
  if (reason === "failed") return "The external sign-in could not be completed. Please try again.";
  if (reason === "provider") return "Unknown sign-in provider.";
  return null;
}

function registerErrorMessage(reason: string | undefined, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (reason === "rate-limited") return t.auth.errors.tooManyAccounts;
  if (reason === "already-used") return t.auth.errors.accountUsed;
  if (reason === "invalid") return t.auth.errors.invalidAccount;
  return null;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ loginError?: string; registerError?: string; oauthError?: string; returnTo?: string }>;
}) {
  const t = await getTranslations();
  const params = searchParams ? await searchParams : {};
  const loginError = loginErrorMessage(params.loginError, t);
  const registerError = registerErrorMessage(params.registerError, t);
  const oauthError = oauthErrorMessage(params.oauthError);
  const providers = configuredOAuthProviders();
  const returnTo = safeReturnTo(params.returnTo);

  return (
    <ForestPageLayout
      title={t.auth.signIn}
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      description={t.auth.description}
    >
    <div className="grid gap-6">
      {oauthError && <p className="quality-banner quality-needs-work">{oauthError}</p>}
      {providers.length > 0 && (
        <section className="panel grid gap-4 p-5">
          <div>
            <h1 className="text-xl font-semibold">Continue with an account</h1>
            <p className="muted mt-1 text-sm">Use a trusted identity provider without creating another password.</p>
          </div>
          <div className="oauth-provider-buttons">
            {providers.map((provider) => (
              <Link
                key={provider.key}
                href={`/api/auth/${provider.key}/start?returnTo=${encodeURIComponent(returnTo)}` as never}
                className="button secondary"
              >
                <LogIn size={17} aria-hidden="true" /> Continue with {provider.label}
              </Link>
            ))}
          </div>
        </section>
      )}
      <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h1 className="mb-2 text-2xl font-bold">{t.auth.signIn}</h1>
        {loginError && <p className="quality-banner quality-needs-work mb-4">{loginError}</p>}
        <form action={loginAction} className="panel grid gap-4 p-5">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t.auth.usernameOrEmail}</span>
            <input name="identifier" required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t.auth.password}</span>
            <input name="password" type="password" required />
          </label>
          <button type="submit">{t.auth.signIn}</button>
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-2xl font-bold">{t.auth.createAccount}</h2>
        {registerError && <p className="quality-banner quality-needs-work mb-4">{registerError}</p>}
        <form action={registerAction} className="panel grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t.auth.profileName}</span>
            <input name="displayName" minLength={2} maxLength={DISPLAY_NAME_MAX_LENGTH} required />
            <small className="muted">{t.auth.profileNameHelp}</small>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t.auth.email}</span>
            <input name="email" type="email" placeholder="you@example.com" required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t.auth.password}</span>
            <input name="password" type="password" minLength={8} required />
          </label>
          <label className="grid gap-2">
            <span className="field-label-with-help text-sm font-medium">
              {t.auth.mathLevelQuestion}
              <span className="help-link" tabIndex={0} title={t.auth.mathLevelHelp} aria-label={t.auth.mathLevelHelp}>
                ?
              </span>
            </span>
            <select name="mathLevel" required defaultValue="">
              <option value="" disabled>
                {t.auth.chooseLevel}
              </option>
              {MATH_LEVEL_OPTIONS.map((level) => (
                <option key={level.value} value={level.value}>
                  {t.auth.mathLevels[level.value]} ({t.auth.mathLevelRange(level.range)})
                </option>
              ))}
            </select>
            <small className="muted">{t.auth.mathLevelHelp}</small>
          </label>
          <button type="submit">{t.auth.createAccount}</button>
        </form>
      </section>
      </div>
    </div>
    </ForestPageLayout>
  );
}
