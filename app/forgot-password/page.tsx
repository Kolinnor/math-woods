import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { requestPasswordResetAction } from "@/lib/actions/auth-actions";
import { getTranslations } from "@/lib/i18n/server";

function resetRequestMessage(reason: string | undefined, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (reason === "sent") return t.forgotPasswordPage.sent;
  if (reason === "not-configured") return t.forgotPasswordPage.notConfigured;
  if (reason === "rate-limited") return t.forgotPasswordPage.rateLimited;
  return null;
}

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams?: Promise<{ resetRequest?: string }>;
}) {
  const t = await getTranslations();
  const params = searchParams ? await searchParams : {};
  const message = resetRequestMessage(params.resetRequest, t);
  const isSent = params.resetRequest === "sent";
  const labels = t.forgotPasswordPage;

  return (
    <ForestPageLayout
      title={labels.title}
      eyebrow={labels.eyebrow}
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      description={labels.description}
      workspaceClassName="forest-page-workspace-narrow"
    >
      <section className="panel grid gap-4 p-6">
        {message && (
          <p
            className={
              isSent
                ? "panel border-green-700 bg-green-50 p-4 text-sm text-green-900"
                : "panel border-amber-700 bg-amber-50 p-4 text-sm text-amber-950"
            }
          >
            {message}
          </p>
        )}
        <form action={requestPasswordResetAction} className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{labels.identifierLabel}</span>
            <input name="identifier" required />
          </label>
          <button type="submit">{labels.submit}</button>
        </form>
        <Link href="/login" className="button secondary">
          {labels.backToLogin}
        </Link>
      </section>
    </ForestPageLayout>
  );
}
