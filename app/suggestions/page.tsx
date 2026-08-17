import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { SignInLink } from "@/components/SignInLink";
import { UserName } from "@/components/UserName";
import { createSuggestionAction } from "@/lib/actions/suggestion-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { isVerifiedContributor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage({
  searchParams
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await getCurrentUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const canContribute = Boolean(user && isVerifiedContributor(user));
  const { submitted } = await searchParams;
  const suggestions = await prisma.suggestion.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: true },
    take: 30
  });

  return (
    <ForestPageLayout
      title={t.suggestionsPage.title}
      eyebrow={t.suggestionsPage.eyebrow}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={t.suggestionsPage.description}
      meta={<p>{t.suggestionsPage.recentCount(suggestions.length)}</p>}
    >
      {submitted && <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">{t.suggestionsPage.sent}</p>}

      {canContribute ? (
        <form action={createSuggestionAction} className="panel grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t.suggestionsPage.shortTitle}</span>
            <input name="title" maxLength={140} required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t.suggestionsPage.bodyQuestion}</span>
            <textarea name="body" maxLength={4000} required />
          </label>
          <button type="submit">{t.suggestionsPage.send}</button>
        </form>
      ) : user ? (
        <p className="panel p-5">
          <Link href="/settings?verify=required" className="underline">
            {t.suggestionsPage.verifyEmail}
          </Link>{" "}
          {t.suggestionsPage.beforeSending}
        </p>
      ) : (
        <p className="panel p-5">
          <SignInLink className="underline">
            {t.nav.signIn}
          </SignInLink>{" "}
          {t.suggestionsPage.signInToSend}
        </p>
      )}

      <section>
        <h2 className="mb-3 font-semibold">{t.suggestionsPage.recent}</h2>
        <div className="grid gap-3">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-semibold">{suggestion.title}</h3>
                <span className="muted text-xs">{t.suggestionsPage.statuses[suggestion.status]}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{suggestion.body}</p>
              <p className="muted mt-3 text-xs">
                {suggestion.author ? <UserName user={suggestion.author} /> : t.suggestionsPage.formerUser} ·{" "}
                {suggestion.createdAt.toLocaleDateString(interfaceLocale)}
              </p>
            </article>
          ))}
          {suggestions.length === 0 && <p className="muted panel p-5">{t.suggestionsPage.noSuggestions}</p>}
        </div>
      </section>
    </ForestPageLayout>
  );
}
