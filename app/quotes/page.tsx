import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { Prisma } from "@prisma/client";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LanguageField } from "@/components/LanguageField";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { createQuoteAction } from "@/lib/actions/quote-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { contentLanguageLabel } from "@/lib/languages";
import { isVerifiedContributor } from "@/lib/permissions";
import { canViewProblem } from "@/lib/problem-visibility";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";

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
  const preferredLanguage = await getPreferredContentLanguage();
  const canContribute = Boolean(user && isVerifiedContributor(user));
  const { q = "" } = await searchParams;
  const query = q.trim();
  const where: Prisma.QuoteWhereInput = query
    ? {
        language: preferredLanguage,
        OR: [
          { text: { contains: query, mode: "insensitive" } },
          { attributedTo: { contains: query, mode: "insensitive" } },
          { provenance: { contains: query, mode: "insensitive" } },
          { provenanceDetails: { contains: query, mode: "insensitive" } }
        ]
      }
    : { language: preferredLanguage };

  const { quotes, unavailable } = await findQuotes(where, user);

  return (
    <ForestPageLayout
      title="Quotes"
      eyebrow="Source notes"
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description="Short passages, source notes, and nearby pages."
      meta={
        <>
          <p>{quotes.length} quotes shown</p>
          <p>{contentLanguageLabel(preferredLanguage)}</p>
        </>
      }
      sidebar={
        <>
        <h2 className="mb-3 font-semibold">Add a quote</h2>
        {canContribute ? (
          <form action={createQuoteAction} className="quote-form">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Quote</span>
              <textarea name="text" required maxLength={1200} placeholder="A sentence or short passage." />
            </label>
            <LanguageField defaultValue={preferredLanguage} />
            <label className="grid gap-2">
              <span className="text-sm font-medium">Attributed to</span>
              <input name="attributedTo" maxLength={160} placeholder="Grothendieck, Polya, Unknown..." />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Provenance</span>
              <input name="provenance" maxLength={240} placeholder="Unknown" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Detailed provenance</span>
              <textarea
                name="provenanceDetails"
                className="compact-textarea"
                maxLength={3000}
                placeholder="Book, page, lecture, archive link, uncertainty note..."
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Related problem slugs</span>
              <input name="problemSlugs" placeholder="roots-and-coefficients, ..." />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Related concept slugs</span>
              <input name="conceptSlugs" placeholder="polynomial vieta-relations" />
            </label>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Optional note</span>
              <MarkdownEditor name="noteMarkdown" initialValue="" minHeight="8rem" lineNumbers={false} />
            </div>
            <button type="submit">Add quote</button>
          </form>
        ) : user ? (
          <p className="panel p-4 text-sm">
            <Link href="/settings?verify=required" className="underline">
              Verify your email
            </Link>{" "}
            before adding quotes.
          </p>
        ) : (
          <p className="panel p-4 text-sm">
            <Link href="/login" className="underline">
              {t.nav.signIn}
            </Link>{" "}
            to add a quote.
          </p>
        )}
        </>
      }
    >
      <LiveSearchForm className="quote-search mb-6">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Search quotes</span>
          <input name="q" defaultValue={query} placeholder="Search text, attribution, or provenance" />
        </label>
        <button type="submit">Search</button>
      </LiveSearchForm>

      {unavailable && (
        <p className="quality-banner quality-needs-work mb-4">
          The quotes table is missing. Run the latest database migration.
        </p>
      )}

      <div className="quote-list">
        {quotes.map((quote) => (
          <article key={quote.id} className="quote-card">
            <Link href={`/quotes/${quote.slug}`} className="quote-text">
              "{quote.text}"
            </Link>
            <div className="quote-meta-row">
              <span>{quote.attributedTo ? `Attributed to ${quote.attributedTo}` : "No attribution recorded"}</span>
              <span>added by {quote.contributor ? displayNameForUser(quote.contributor) : "former user"}</span>
            </div>
            <details className="quote-provenance">
              <summary>
                <span>Provenance</span>
                <strong>{quote.provenance}</strong>
              </summary>
              <p>{quote.provenanceDetails || "No further provenance details are known yet."}</p>
            </details>
            <div className="quote-related">
              {quote.relatedProblems.map(({ problem }) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`}>
                  <AsyncMarkdownInline markdown={problem.title} />
                </Link>
              ))}
              {quote.relatedConcepts.map(({ concept }) => (
                <Link key={concept.id} href={`/concepts/${concept.slug}`}>
                  {concept.title}
                </Link>
              ))}
              {quote._count.relatedProblems + quote._count.relatedConcepts === 0 && (
                <span className="muted">No related pages yet.</span>
              )}
            </div>
          </article>
        ))}
        {quotes.length === 0 && <p className="empty-state">No quotes match this search.</p>}
      </div>
    </ForestPageLayout>
  );
}
