import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { translatedDomainLabel } from "@/lib/domains";
import { EXPLORATIONS_ENABLED } from "@/lib/feature-flags";
import { getTranslations } from "@/lib/i18n/server";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { problemLinkClass } from "@/lib/problem-link";
import { visibleProblemWhere } from "@/lib/problem-visibility";
import { rankSearchMatches, searchDatabaseVariants, searchMorphologyVariants } from "@/lib/search-ranking";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { selectContentTranslationsByGroup } from "@/lib/translation-routing";

export const dynamic = "force-dynamic";

async function searchQuotes(query: string, language: string, databaseSearchVariants: readonly string[]) {
  try {
    const quotes = await prisma.quote.findMany({
      where: {
        language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
        OR: databaseSearchVariants.flatMap((variant) => [
          { text: { contains: variant, mode: "insensitive" as const } },
          { attributedTo: { contains: variant, mode: "insensitive" as const } },
          { provenance: { contains: variant, mode: "insensitive" as const } }
        ])
      },
      take: 100
    });
    return selectContentTranslationsByGroup(quotes, language);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2021") {
      return [];
    }
    throw error;
  }
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.trim() ?? "";
  const user = await getCurrentUser();
  const t = await getTranslations();
  const preferredLanguage = await getPreferredContentLanguage();
  const morphologyVariants = searchMorphologyVariants(query, preferredLanguage);
  const databaseSearchVariants = searchDatabaseVariants(query, morphologyVariants);
  const [conceptRows, problemRows, explorationRows, quotes] = query
    ? await Promise.all([
        prisma.concept.findMany({
          where: {
            language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
            OR: databaseSearchVariants.flatMap((variant) => [
              { title: { contains: variant, mode: "insensitive" as const } },
              { bodyMarkdown: { contains: variant, mode: "insensitive" as const } },
              { aliases: { some: { alias: { contains: variant, mode: "insensitive" as const } } } }
            ])
          },
          include: { aliases: true },
          take: 100
        }),
        prisma.problem.findMany({
          where: {
            status: "PUBLISHED",
            listed: true,
            language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
            ...visibleProblemWhere(user),
            OR: databaseSearchVariants.flatMap((variant) => [
              { title: { contains: variant, mode: "insensitive" as const } },
              { bodyMarkdown: { contains: variant, mode: "insensitive" as const } },
              { origin: { contains: variant, mode: "insensitive" as const } }
            ])
          },
          take: 100
        }),
        EXPLORATIONS_ENABLED
          ? prisma.playlist.findMany({
              where: {
                visibility: "PUBLIC",
                status: "PUBLISHED",
                language: { in: ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code) },
                OR: databaseSearchVariants.flatMap((variant) => [
                  { title: { contains: variant, mode: "insensitive" as const } },
                  { descriptionMarkdown: { contains: variant, mode: "insensitive" as const } }
                ])
              },
              take: 100
            })
          : Promise.resolve([]),
        searchQuotes(query, preferredLanguage, databaseSearchVariants)
      ])
    : [[], [], [], []];
  const selectedConcepts = selectContentTranslationsByGroup(
    conceptRows.map((concept) => ({
      ...concept,
      isSource: concept.translatedFromConceptId === null
    })),
    preferredLanguage
  );
  const selectedProblems = selectContentTranslationsByGroup(
    problemRows.map((problem) => ({
      ...problem,
      isSource: problem.translatedFromProblemId === null
    })),
    preferredLanguage
  );
  const selectedExplorations = selectContentTranslationsByGroup(explorationRows, preferredLanguage);
  const concepts = query
    ? rankSearchMatches(
        selectedConcepts.map((concept) => ({
          item: concept,
          title: concept.title,
          slug: concept.slug,
          aliases: concept.aliases.map(({ alias }) => alias),
          language: concept.language,
          searchText: [concept.bodyMarkdown]
        })),
        query,
        preferredLanguage,
        morphologyVariants
      ).slice(0, 20).map(({ item }) => item)
    : selectedConcepts;
  const problems = query
    ? rankSearchMatches(
        selectedProblems.map((problem) => ({
          item: problem,
          title: problem.title,
          slug: problem.slug,
          language: problem.language,
          searchText: [problem.bodyMarkdown, problem.origin]
        })),
        query,
        preferredLanguage,
        morphologyVariants
      ).slice(0, 20).map(({ item }) => item)
    : selectedProblems;
  const explorations = query
    ? rankSearchMatches(
        selectedExplorations.map((exploration) => ({
          item: exploration,
          title: exploration.title,
          slug: exploration.slug,
          language: exploration.language,
          searchText: [exploration.descriptionMarkdown]
        })),
        query,
        preferredLanguage,
        morphologyVariants
      ).slice(0, 20).map(({ item }) => item)
    : selectedExplorations;
  const rankedQuotes = query
    ? rankSearchMatches(
        quotes.map((quote) => ({
          item: quote,
          title: quote.text,
          slug: quote.slug,
          language: quote.language,
          searchText: [quote.attributedTo ?? "", quote.provenance ?? ""]
        })),
        query,
        preferredLanguage,
        morphologyVariants
      ).slice(0, 20).map(({ item }) => item)
    : quotes;
  const solvedAttempts = user
    ? await prisma.problemAttempt.findMany({
        where: {
          userId: user.id,
          status: "SOLVED",
          problem: { translationGroupId: { in: problems.map((problem) => problem.translationGroupId) } }
        },
        select: { problem: { select: { translationGroupId: true } } }
      })
    : [];
  const solvedGroupIds = new Set(solvedAttempts.map((attempt) => attempt.problem.translationGroupId));
  const solvedIds = new Set(
    problems.filter((problem) => solvedGroupIds.has(problem.translationGroupId)).map((problem) => problem.id)
  );

  const total = concepts.length + problems.length + explorations.length + rankedQuotes.length;

  return (
    <ForestPageLayout
      title={t.searchPage.title}
      eyebrow={t.searchPage.eyebrow}
      heroImage="/art/brook-in-the-forest.jpg"
      heroAlt="Ivan Shishkin, Brook in the Forest"
      description={t.searchPage.description}
      meta={
        query ? (
          <p>
            {t.searchPage.resultCount(total, preferredLanguage)}
          </p>
        ) : (
          <p>{t.searchPage.enterTerm}</p>
        )
      }
    >
      <div className="mb-6">
        <LiveSearchForm className="mt-4 flex gap-2">
          <input name="q" defaultValue={query} placeholder={t.searchPage.placeholder} autoFocus />
          <button type="submit">{t.common.search}</button>
        </LiveSearchForm>
        {query && (
          <p className="muted mt-3 text-sm" role="status" aria-live="polite">
            {t.searchPage.resultsFor(total, preferredLanguage, query)}
          </p>
        )}
      </div>

      <div className="grid gap-7 lg:grid-cols-3">
        <section>
          <h2 className="mb-3 font-semibold">{t.searchPage.concepts}</h2>
          <div className="grid gap-3">
            {concepts.map((concept) => (
              <Link key={concept.id} href={`/concepts/${concept.slug}`} className="panel block p-4">
                <div className="font-medium"><AsyncMarkdownInline markdown={concept.title} /><ContentLanguageFallback language={concept.language} expectedLanguage={preferredLanguage} /></div>
                <div className="muted mt-1 text-xs">
                  {translatedDomainLabel(concept.domainCode, t.home.domainLabels)} / {t.concepts.statuses[concept.status]}
                </div>
                {concept.aliases.length > 0 && (
                  <div className="muted mt-1 text-xs">{concept.aliases.map((alias) => alias.alias).join(", ")}</div>
                )}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">{t.searchPage.problems}</h2>
          <div className="grid gap-3">
            {problems.map((problem) => (
              <Link
                key={problem.id}
                href={`/problems/${problem.slug}`}
                className={problemLinkClass("panel block p-4", solvedIds.has(problem.id))}
              >
                <div className="font-medium">
                  <AsyncMarkdownInline markdown={problem.title} />
                  <ContentLanguageFallback language={problem.language} expectedLanguage={preferredLanguage} />
                </div>
                <div className="muted mt-1 text-xs">{translatedDomainLabel(problem.domain, t.home.domainLabels)}</div>
              </Link>
            ))}
          </div>
        </section>

        {EXPLORATIONS_ENABLED && <section>
          <h2 className="mb-3 font-semibold">{t.searchPage.explorations}</h2>
          <div className="grid gap-3">
            {explorations.map((exploration) => (
              <Link key={exploration.id} href={`/explorations/${exploration.slug}/start` as never} className="panel block p-4">
                <div className="font-medium">{exploration.title}<ContentLanguageFallback language={exploration.language} expectedLanguage={preferredLanguage} /></div>
              </Link>
            ))}
          </div>
        </section>}

        <section>
          <h2 className="mb-3 font-semibold">{t.searchPage.quotes}</h2>
          <div className="grid gap-3">
            {rankedQuotes.map((quote) => (
              <Link key={quote.id} href={`/quotes/${quote.slug}`} className="panel block p-4">
                <div className="font-medium">"{quote.text}"<ContentLanguageFallback language={quote.language} expectedLanguage={preferredLanguage} /></div>
                <div className="muted mt-1 text-xs">{quote.attributedTo ?? quote.provenance}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {query && total === 0 && (
        <p className="muted panel mt-6 p-5">
          {t.searchPage.noResults}
        </p>
      )}
    </ForestPageLayout>
  );
}
