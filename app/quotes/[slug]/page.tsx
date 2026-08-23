import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canViewProblem, visibleProblemWhere } from "@/lib/problem-visibility";
import { problemStyleLabel } from "@/lib/problem-styles";
import {
  resolveConceptLinksForLanguage,
  resolveConceptTitlesForLanguage,
  resolveProblemLinksForLanguage
} from "@/lib/translated-markdown";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [user, t, interfaceLocale] = await Promise.all([
    getCurrentUser(),
    getTranslations(),
    getInterfaceLocale()
  ]);
  const quote = await prisma.quote.findUnique({
    where: { slug },
    include: {
      contributor: true,
      relatedProblems: {
        include: {
          problem: true
        },
        orderBy: { problem: { title: "asc" } }
      },
      relatedConcepts: {
        include: {
          concept: {
            include: { aliases: { orderBy: { alias: "asc" } } }
          }
        },
        orderBy: { concept: { title: "asc" } }
      }
    }
  });

  if (!quote) notFound();
  const relatedProblems = quote.relatedProblems.filter(({ problem }) => canViewProblem(user, problem));
  const relatedProblemSlugs = relatedProblems.map(({ problem }) => problem.slug);
  const relatedConceptSlugs = quote.relatedConcepts.map(({ concept }) => concept.slug);
  const [problemLinkBySlug, conceptLinkBySlug, conceptTitleBySlug] = await Promise.all([
    resolveProblemLinksForLanguage(relatedProblemSlugs, quote.language, {
      status: "PUBLISHED",
      listed: true,
      ...visibleProblemWhere(user)
    }),
    resolveConceptLinksForLanguage(relatedConceptSlugs, quote.language),
    resolveConceptTitlesForLanguage(relatedConceptSlugs, quote.language)
  ]);

  return (
    <ForestPageLayout
      title={quote.attributedTo ?? t.quotePage.unattributed}
      eyebrow={t.quotePage.eyebrow}
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description={
        <span>
          {t.quotePage.addedBy} {quote.contributor ? <UserName user={quote.contributor} /> : t.quotePage.formerUser} {t.quotePage.on}{" "}
          {quote.createdAt.toLocaleDateString(interfaceLocale)}
        </span>
      }
      meta={
        <>
          <p>{t.quotePage.relatedProblemsCount(relatedProblems.length)}</p>
          <p>{t.quotePage.relatedConceptsCount(quote.relatedConcepts.length)}</p>
        </>
      }
    >
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <section className="quote-reading">
          <blockquote>“{quote.text}”</blockquote>
          {quote.attributedTo && <p>— {quote.attributedTo}</p>}
        </section>

        {quote.noteHtml && (
          <section className="mt-6 reading-surface">
            <h2 className="mb-3 text-lg font-semibold">{t.quotePage.note}</h2>
            <MarkdownBlock html={quote.noteHtml} />
          </section>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold">{t.quotePage.relatedProblems}</h2>
            <div className="grid gap-3">
              {relatedProblems.map(({ problem }) => (
                <Link key={problem.id} href={(problemLinkBySlug.get(problem.slug)?.href ?? `/problems/${problem.slug}`) as never} className="panel block p-4">
                  <div className="font-medium">
                    <AsyncMarkdownInline markdown={problemLinkBySlug.get(problem.slug)?.title ?? problem.title} />
                    <ContentLanguageFallback language={problemLinkBySlug.get(problem.slug)?.language ?? problem.language} expectedLanguage={quote.language} />
                  </div>
                  <div className="muted mt-2 flex flex-wrap gap-2 text-xs">
                    {problem.styles.map((style) => (
                      <span key={style} className="tag">
                        {problemStyleLabel(style, problem.language)}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
              {relatedProblems.length === 0 && <p className="empty-state">{t.quotePage.noRelatedProblems}</p>}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold">{t.quotePage.relatedConcepts}</h2>
            <div className="grid gap-3">
              {quote.relatedConcepts.map(({ concept }) => (
                <Link key={concept.id} href={(conceptLinkBySlug.get(concept.slug)?.href ?? `/concepts/${concept.slug}`) as never} className="panel block p-4">
                  <div className="font-medium"><AsyncMarkdownInline markdown={conceptTitleBySlug.get(concept.slug) ?? concept.title} /><ContentLanguageFallback language={conceptLinkBySlug.get(concept.slug)?.language ?? concept.language} expectedLanguage={quote.language} /></div>
                  {concept.aliases.length > 0 && (
                    <div className="muted mt-1 text-xs">{concept.aliases.map((alias) => alias.alias).join(", ")}</div>
                  )}
                </Link>
              ))}
              {quote.relatedConcepts.length === 0 && <p className="empty-state">{t.quotePage.noRelatedConcepts}</p>}
            </div>
          </div>
        </section>
      </article>

      <aside className="grid content-start gap-5">
        <section className="action-surface">
          <Link href="/quotes" className="button secondary">
            {t.quotePage.allQuotes}
          </Link>
          <details className="problem-origin text-sm" open>
            <summary>
              <span className="muted">{t.quotePage.provenance}</span>
              <span>{quote.provenance}</span>
            </summary>
            <p className="whitespace-pre-wrap pt-3">
              {quote.provenanceDetails || t.quotePage.noProvenanceDetails}
            </p>
          </details>
        </section>
      </aside>
    </div>
    </ForestPageLayout>
  );
}
