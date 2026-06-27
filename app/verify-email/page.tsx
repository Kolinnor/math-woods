import Link from "next/link";
import { EmailVerificationSuccessSync } from "@/components/EmailVerificationBanner";
import { resendEmailVerificationAction } from "@/lib/actions/account-actions";
import { getCurrentUser } from "@/lib/auth";
import { verifyEmailToken } from "@/lib/email-verification";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const user = await getCurrentUser();
  const result = token ? await verifyEmailToken(token) : { ok: false as const, reason: "missing" as const };
  const canResend = Boolean(user && !user.emailVerifiedAt);

  return (
    <div className="mx-auto max-w-xl">
      <section className="panel grid gap-4 p-6">
        {result.ok ? (
          <>
            <EmailVerificationSuccessSync userId={result.userId!} />
            <h1 className="text-2xl font-bold">Email verified</h1>
            <p>Your email is verified. You can now contribute to Math Woods.</p>
            <Link href="/" className="button">
              Continue
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Verification link expired</h1>
            <p className="muted">
              This email verification link is missing, invalid, or expired.
            </p>
            {canResend ? (
              <form action={resendEmailVerificationAction}>
                <button type="submit" className="secondary">
                  Resend verification email
                </button>
              </form>
            ) : (
              <Link href="/login" className="button secondary">
                Sign in to resend
              </Link>
            )}
          </>
        )}
      </section>
    </div>
  );
}
