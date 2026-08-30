import Link from "next/link";
import { EmailVerificationSuccessSync } from "@/components/EmailVerificationBanner";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { SignInLink } from "@/components/SignInLink";
import { resendEmailVerificationAction } from "@/lib/actions/account-actions";
import { getCurrentUser } from "@/lib/auth";
import { verifyEmailToken } from "@/lib/email-verification";
import { getTranslations } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const t = await getTranslations();
  const user = await getCurrentUser();
  const result = token ? await verifyEmailToken(token) : { ok: false as const, reason: "missing" as const };
  const canResend = Boolean(user && !user.emailVerifiedAt);
  const labels = t.verifyEmailPage;
  const emailChanged = result.ok && result.emailChanged;
  const emailConflict = !result.ok && result.reason === "email-in-use";

  return (
    <ForestPageLayout
      title={emailChanged ? labels.changedTitle : result.ok ? labels.verifiedTitle : emailConflict ? labels.conflictTitle : labels.expiredTitle}
      eyebrow={labels.eyebrow}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={labels.description}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <section className="panel grid gap-4 p-6">
        {result.ok ? (
          <>
            <EmailVerificationSuccessSync userId={result.userId!} />
            <p>{emailChanged ? labels.changedSuccess : labels.success}</p>
            <Link href="/" className="button">
              {labels.continue}
            </Link>
          </>
        ) : (
          <>
            <p className="muted">
              {emailConflict ? labels.conflict : labels.invalid}
            </p>
            {emailConflict && user ? (
              <Link href="/settings" className="button secondary">
                {labels.chooseAnother}
              </Link>
            ) : canResend ? (
              <form action={resendEmailVerificationAction}>
                <button type="submit" className="secondary">
                  {labels.resend}
                </button>
              </form>
            ) : (
              <SignInLink className="button secondary">
                {t.auth.signInToResend}
              </SignInLink>
            )}
          </>
        )}
      </section>
    </ForestPageLayout>
  );
}
