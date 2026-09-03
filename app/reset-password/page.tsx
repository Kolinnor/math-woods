import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { resetPasswordAction } from "@/lib/actions/auth-actions";
import { getTranslations } from "@/lib/i18n/server";
import { checkPasswordResetToken } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

type ResetErrorReason = "mismatch" | "expired" | "identifier-mismatch" | "weak-password" | "rate-limited";

function isResetErrorReason(value: string | undefined): value is ResetErrorReason {
  return value === "mismatch" ||
    value === "expired" ||
    value === "identifier-mismatch" ||
    value === "weak-password" ||
    value === "rate-limited";
}

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string; resetError?: string }>;
}) {
  const { token = "", resetError } = await searchParams;
  const t = await getTranslations();
  const labels = t.resetPasswordPage;
  const check = token ? await checkPasswordResetToken(token) : { ok: false as const, reason: "expired" as const };
  const errorReason = isResetErrorReason(resetError) ? resetError : null;
  const errorMessage = errorReason ? labels.errors[errorReason] : null;

  return (
    <ForestPageLayout
      title={check.ok ? labels.title : labels.invalidTitle}
      eyebrow={labels.eyebrow}
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      description={check.ok ? labels.description : undefined}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <section className="panel grid gap-4 p-6">
        {check.ok ? (
          <>
            {errorMessage && <p className="panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">{errorMessage}</p>}
            <form action={resetPasswordAction} className="grid gap-4">
              <input type="hidden" name="token" value={token} />
              <label className="grid gap-2">
                <span className="text-sm font-medium">{labels.identifierLabel}</span>
                <input name="identifier" required />
                <small className="muted">{labels.identifierHelp}</small>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">{labels.passwordLabel}</span>
                <input name="password" type="password" minLength={8} required />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium">{labels.confirmPasswordLabel}</span>
                <input name="confirmPassword" type="password" minLength={8} required />
              </label>
              <button type="submit">{labels.submit}</button>
            </form>
          </>
        ) : (
          <>
            <p className="muted">{labels.invalid}</p>
            <Link href="/forgot-password" className="button secondary">
              {labels.requestNew}
            </Link>
          </>
        )}
      </section>
    </ForestPageLayout>
  );
}
