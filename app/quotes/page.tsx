import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { UserName } from "@/components/UserName";
import { createQuoteAction } from "@/lib/actions/quote-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { ACTIVE_CONTENT_LANGUAGES, contentLanguageLabel } from "@/lib/languages";
import { isVerifiedContributor } from "@/lib/permissions";
import { canViewProblem } from "@/lib/problem-visibility";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { rankSearchMatches, searchMorphologyVariants } from "@/lib/search-ranking";
import { selectContentTranslationsByGroup } from "@/lib/translation-routing";

export const dynamic = "force-dynamic";

async function findQuotes(where: Prisma.QuoteWhereInput, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  try {
    const quotes = await prisma.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        contributor: true,
        relatedProblems: { include: { problem: true }, take: 4 },
        relatedConcepts: { include: { concept: true }, take: 4 },
        _count: { select: { relatedProblems: true, relatedConcepts: true } }
      }
    });
    return {
      quotes: quotes.map((quote) => ({
        ...quote,
        relatedProblems: quote.relatedProblems.filter(({ problem }) => canViewProblem(user, problem))
      })),
      unavailable: false
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2021") {
      return { quotes: [], unavailable: true };
    }
    throw error;
  }
}

export default async function QuotesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  const t = await getTranslations();
  const labels = t.quotesPage;
  const preferredLanguage = await getPreferredContentLanguage();
  const canContribute = Boolean(user && isVerifiedContributor(user));
  const { q = "" } = await searchParams;
  const query = q.trim();
  const where: Prisma.QuoteWhereInput = query
    ? {
        language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
        OR: [
          { text: { contains: query, mode: "insensitive" } },
          { attributedTo: { contains: query, mode: "insensitive" } },
          { provenance: { contains: query, mode: "insensitive" } },
          { provenanceDetails: { contains: query, mode: "insensitive" } }
        ]
      }
    : { language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) } };

  const { quotes: quoteRows, unavailable } = await findQuotes(where, user);
  const selectedQuotes = selectContentTranslationsByGroup(quoteRows, preferredLanguage);
  const quotes = query
    ? rankSearchMatches(
        selectedQuotes.map((quote) => ({
          item: quote,
          title: quote.text,
          slug: quote.slug,
          language: quote.language,
          searchText: [quote.attributedTo, quote.provenance, quote.provenanceDetails]
        })),
        query,
        preferredLanguage,
        searchMorphologyVariants(query, preferredLanguage),
        (left, right) => right.item.createdAt.getTime() - left.item.createdAt.getTime()
      ).map(({ item }) => item)
    : selectedQuotes;

  return (
    <ForestPageLayout
      title={labels.title}
      eyebrow={labels.eyebrow}
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description={labels.description}
      meta={
        <>
          <p>{labels.shown(quotes.length)}</p>
          <p>{contentLanguageLabel(preferredLanguage)}</p>
        </>
      }
      sidebar={
        <>
        <h2 className="mb-3 font-semibold">{labels.addQuote}</h2>
        {canContribute ? (
          <form action={createQuoteAction} className="quote-form">
            <label className="grid gap-2">
              <span className="text-sm font-medium">{labels.quote}</span>
              <textarea name="text" required maxLength={1200} placeholder={labels.quotePlaceholder} />
            </label>
            <LanguageField defaultValue={preferredLanguage} label={t.contentEditor.language} />
            <label className="grid gap-2">
              <span className="text-sm font-medium">{labels.attributedTo}</span>
              <input name="attributedTo" maxLength={160} placeholder={labels.attributedToPlaceholder} />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{labels.provenance}</span>
              <input name="provenance" maxLength={240} placeholder="Unknown" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{labels.detailedProvenance}</span>
              <textarea
                name="provenanceDetails"
                className="compact-textarea"
                maxLength={3000}
                placeholder={labels.detailedProvenancePlaceholder}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{labels.relatedProblemSlugs}</span>
              <input name="problemSlugs" placeholder="roots-and-coefficients, ..." />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">{labels.relatedConceptSlugs}</span>
              <input name="conceptSlugs" placeholder="polynomial vieta-relations" />
            </label>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{labels.optionalNote}</span>
              <MarkdownEditor name="noteMarkdown" initialValue="" minHeight="8rem" lineNumbers={false} />
            </div>
            <button type="submit">{labels.addQuote}</button>
          </form>
        ) : user ? (
          <p className="panel p-4 text-sm">
            <Link href="/settings?verify=required" className="underline">
              {labels.verifyEmail}
            </Link>{" "}
            {labels.beforeAdding}
          </p>
        ) : (
          <p className="panel p-4 text-sm">
            <Link href="/login" className="underline">
              {t.nav.signIn}
            </Link>{" "}
            {labels.signInToAdd}
          </p>
        )}
        </>
      }
    >
      <LiveSearchForm className="quote-search mb-6">
        <label className="grid gap-2">
          <span className="text-sm font-medium">{labels.searchQuotes}</span>
          <input name="q" defaultValue={query} placeholder={labels.searchPlaceholder} />
        </label>
        <button type="submit">{labels.search}</button>
      </LiveSearchForm>

      {unavailable && (
        <p className="quality-banner quality-needs-work mb-4">
          {labels.missingTable}
        </p>
      )}

      <div className="quote-list">
        {quotes.map((quote) => (
          <article key={quote.id} className="quote-card">
            <Link href={`/quotes/${quote.slug}`} className="quote-text">
              "{quote.text}"
            </Link>
            <div className="quote-meta-row">
              <span>{quote.attributedTo ? `${labels.attributedTo} ${quote.attributedTo}` : labels.noAttribution}</span>
              <span>{labels.addedBy} {quote.contributor ? <UserName user={quote.contributor} /> : labels.formerUser}</span>
            </div>
            <details className="quote-provenance">
              <summary>
                <span>{labels.provenance}</span>
                <strong>{quote.provenance}</strong>
              </summary>
              <p>{quote.provenanceDetails || labels.noDetails}</p>
            </details>
            <div className="quote-related">
              {quote.relatedProblems.map(({ problem }) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`}>
                  <AsyncMarkdownInline markdown={problem.title} />
                </Link>
              ))}
              {quote.relatedConcepts.map(({ concept }) => (
                <Link key={concept.id} href={`/concepts/${concept.slug}`}>
                  <AsyncMarkdownInline markdown={concept.title} />
                </Link>
              ))}
              {quote._count.relatedProblems + quote._count.relatedConcepts === 0 && (
                <span className="muted">{labels.noRelatedPages}</span>
              )}
            </div>
          </article>
        ))}
        {quotes.length === 0 && <p className="empty-state">{labels.noMatches}</p>}
      </div>
    </ForestPageLayout>
  );
}
