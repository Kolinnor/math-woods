import { ForestPageLayout } from "@/components/ForestPageLayout";
import { loginAction, registerAction } from "@/lib/actions/auth-actions";
import { getTranslations } from "@/lib/i18n/server";
import { MATH_LEVEL_OPTIONS } from "@/lib/math-levels";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/user-display";

function loginErrorMessage(reason: string | undefined, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (reason === "rate-limited") return t.auth.errors.tooManySignIns;
  if (reason === "invalid") return t.auth.errors.invalidSignIn;
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
  searchParams?: Promise<{ loginError?: string; registerError?: string }>;
}) {
  const t = await getTranslations();
  const params = searchParams ? await searchParams : {};
  const loginError = loginErrorMessage(params.loginError, t);
  const registerError = registerErrorMessage(params.registerError, t);

  return (
    <ForestPageLayout
      title={t.auth.signIn}
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      description={t.auth.description}
    >
    <div className="grid gap-6 md:grid-cols-2">
      <section>
        <h1 className="mb-2 text-2xl font-bold">{t.auth.signIn}</h1>
        {loginError && <p className="quality-banner quality-needs-work mb-4">{loginError}</p>}
        <form action={loginAction} className="panel grid gap-4 p-5">
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
    </ForestPageLayout>
  );
}
