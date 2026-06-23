import Link from "next/link";
import { verifyEmailToken } from "@/lib/email-verification";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const result = token ? await verifyEmailToken(token) : { ok: false as const, reason: "missing" as const };

  return (
    <div className="mx-auto max-w-xl">
      <section className="panel grid gap-4 p-6">
        {result.ok ? (
          <>
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
              This email verification link is missing, invalid, or expired. You can request a fresh one from settings.
            </p>
            <Link href="/settings?verify=required" className="button secondary">
              Go to settings
            </Link>
          </>
        )}
      </section>
    </div>
  );
}
