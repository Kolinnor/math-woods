import { ConceptKind, ConceptStatus, MathDomain, Prisma } from "@prisma/client";
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ConceptEditedBadge, ConceptStatusBadge } from "@/components/ConceptStatusBadge";
import { ContentLanguageFallback } from "@/components/ContentLanguageFallback";
import { ContributionRequestDialog } from "@/components/ContributionRequestDialog";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { createContributionRequestAction } from "@/lib/actions/contribution-request-actions";
import { getCurrentUser } from "@/lib/auth";
import {
  MAX_CONCEPT_EXERCISES,
  parseConceptExerciseCount,
  parseConceptExerciseCountMode
} from "@/lib/concept-exercises";
import { prisma } from "@/lib/db";
import {
  coarseDomainForCode,
  domainCodeAliases,
  parentProblemDomainForCode,
  parseDomainCode,
  PROBLEM_DOMAINS,
  translatedDomainLabel as translatedDomainOptionLabel
} from "@/lib/domains";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { missingConcepts } from "@/lib/internal-links";
import { ACTIVE_CONTENT_LANGUAGES } from "@/lib/languages";
import { canUseAdminTools } from "@/lib/permissions";
import { combineSearchFilters } from "@/lib/search-filters";
import { rankSearchMatches, searchDatabaseVariants, searchMorphologyVariants } from "@/lib/search-ranking";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { contentLanguageViewHref, selectContentTranslationsByGroup } from "@/lib/translation-routing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mathematical Concepts | Math Woods",
  description: "Explore a community-curated graph of mathematical definitions, theorems, examples, and exercises."
};

type SearchValue = string | string[] | undefined;
const ACTIVE_LANGUAGE_CODES = ACTIVE_CONTENT_LANGUAGES.map((language) => language.code);
const ACTIVE_LANGUAGE_CODE_SET = new Set(ACTIVE_LANGUAGE_CODES);

function sourceTypeLabel(sourceType: "PROBLEM" | "CONCEPT" | "PLAYLIST" | "PROOF", t: Dictionary["concepts"]) {
  return t.sourceTypes[sourceType];
}

function translatedDomainLabel(domain: MathDomain | string, t: Dictionary) {
  return translatedDomainOptionLabel(domain, t.home.domainLabels);
}

type ConceptSort = "updated" | "linked";
type ProblemLinkFilter = "all" | "with" | "without";
type MissingTranslationFilter = "fr" | "en" | "";

function parseConceptSort(value: string | undefined): ConceptSort {
  return value === "linked" ? "linked" : "updated";
}

function parseProblemLinkFilter(value: string | undefined): ProblemLinkFilter {
  if (value === "with" || value === "without") return value;
  return "all";
}

function parseMissingTranslationFilter(value: string | undefined): MissingTranslationFilter {
  return value === "fr" || value === "en" ? value : "";
}

function parseLanguageFilters(value: SearchValue, preferredLanguage: string) {
  const values = (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => item.trim().toLowerCase())
    .filter((item) => ACTIVE_LANGUAGE_CODE_SET.has(item));
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length) return uniqueValues;
  return ACTIVE_LANGUAGE_CODE_SET.has(preferredLanguage) ? [preferredLanguage] : ACTIVE_LANGUAGE_CODES;
}

export default async function ConceptsPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string;
    domain?: string;
    exerciseCount?: string;
    exerciseCountMode?: string;
    kind?: string;
    language?: SearchValue;
    minExercises?: string;
    missingTranslation?: string;
    problemLinks?: string;
    sort?: string;
    status?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const [t, interfaceLocale] = await Promise.all([getTranslations(), getInterfaceLocale()]);
  const preferredLanguage = await getPreferredContentLanguage();
  const {
    q = "",
    domain = "",
    exerciseCount = "",
    exerciseCountMode = "",
    kind = "",
    language,
    minExercises = "",
    missingTranslation = "",
    status = "",
    sort = "",
    problemLinks = ""
  } = await searchParams;
  const query = q.trim();
  const morphologyVariants = searchMorphologyVariants(query, preferredLanguage);
  const databaseSearchVariants = searchDatabaseVariants(query, morphologyVariants);
  const requestedLanguageValues = parseLanguageFilters(language, preferredLanguage);
  const missingTranslationValue = parseMissingTranslationFilter(missingTranslation);
  const sourceLanguageValues = missingTranslationValue
    ? requestedLanguageValues.filter((languageCode) => languageCode !== missingTranslationValue)
    : requestedLanguageValues;
  const languageValues = sourceLanguageValues.length
    ? sourceLanguageValues
    : ACTIVE_LANGUAGE_CODES.filter((languageCode) => languageCode !== missingTranslationValue);
  const sortValue = parseConceptSort(sort);
  const exerciseCountValue = parseConceptExerciseCount(exerciseCount || minExercises);
  const exerciseCountModeValue = parseConceptExerciseCountMode(exerciseCountMode);
  const canFilterByProblemLinks = Boolean(user && canUseAdminTools(user));
  const problemLinkFilter = canFilterByProblemLinks ? parseProblemLinkFilter(problemLinks) : "all";
  const domainValue = domain ? parseDomainCode(domain) : undefined;
  const domainWhere: Prisma.ConceptWhereInput = domainValue
    ? {
        OR: [
          { domainCode: { in: domainCodeAliases(domainValue) } },
          ...(parentProblemDomainForCode(domainValue)?.value === domainValue
            ? [{ domain: coarseDomainForCode(domainValue) }]
            : [])
        ]
      }
    : {};
  const statusValue = Object.values(ConceptStatus).includes(status as ConceptStatus)
    ? (status as ConceptStatus)
    : undefined;
  const kindValue = Object.values(ConceptKind).includes(kind as ConceptKind)
    ? (kind as ConceptKind)
    : undefined;
  const translatedGroupIds = missingTranslationValue
    ? (
        await prisma.concept.findMany({
          where: {
            language: missingTranslationValue,
            status: { not: ConceptStatus.MISSING }
          },
          distinct: ["translationGroupId"],
          select: { translationGroupId: true }
        })
      ).map((concept) => concept.translationGroupId)
    : [];
  const linkedConceptSlugs =
    problemLinkFilter === "all"
      ? []
      : (
          await prisma.internalLink.findMany({
            where: {
              sourceType: "PROBLEM",
              targetType: "CONCEPT",
              exists: true
            },
            distinct: ["targetSlug"],
            select: { targetSlug: true }
          })
        ).map((link) => link.targetSlug);
  const exerciseCountFilterActive = exerciseCountValue !== null && !(
    exerciseCountModeValue === "at-least" && exerciseCountValue === 0
  );
  const exerciseCountBoundaryConceptIds = !exerciseCountFilterActive || exerciseCountValue === null
    ? []
    : (
        await prisma.conceptExercise.groupBy({
          by: ["conceptId"],
          having: {
            conceptId: {
              _count: exerciseCountModeValue === "at-most"
                ? { gt: exerciseCountValue }
                : { gte: exerciseCountValue }
            }
          }
        })
      ).map((group) => group.conceptId);
  const where: Prisma.ConceptWhereInput = combineSearchFilters<Prisma.ConceptWhereInput>([
    { language: { in: languageValues } },
    query
      ? {
          OR: databaseSearchVariants.flatMap((variant) => [
            { title: { contains: variant, mode: "insensitive" as const } },
            { bodyMarkdown: { contains: variant, mode: "insensitive" as const } },
            { aliases: { some: { alias: { contains: variant, mode: "insensitive" as const } } } }
          ])
        }
      : null,
    domainValue ? domainWhere : null,
    kindValue ? { kind: kindValue } : null,
    statusValue ? { status: statusValue } : null,
    missingTranslationValue
      ? {
          status: { not: ConceptStatus.MISSING },
          translationGroupId: { notIn: translatedGroupIds }
        }
      : null,
    !exerciseCountFilterActive
      ? null
      : exerciseCountModeValue === "at-most"
        ? { id: { notIn: exerciseCountBoundaryConceptIds } }
        : { id: { in: exerciseCountBoundaryConceptIds } },
    problemLinkFilter === "with"
      ? { slug: { in: linkedConceptSlugs } }
      : problemLinkFilter === "without"
        ? { slug: { notIn: linkedConceptSlugs } }
        : null
  ]);

  const conceptCandidateRows = await prisma.concept.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    ...(sortValue === "updated" && !query ? { take: 75 } : {}),
    include: {
      aliases: true,
      _count: { select: { practiceExercises: true, references: true, talkPosts: true } }
    }
  });
  const conceptCandidates = selectContentTranslationsByGroup(
    conceptCandidateRows.map((concept) => ({
      ...concept,
      isSource: concept.translatedFromConceptId === null
    })),
    preferredLanguage
  );
  const candidateSlugs = conceptCandidates.map((concept) => concept.slug);

  const [incomingLinkGroups, missing, featuredConcepts] = await Promise.all([
    candidateSlugs.length
      ? prisma.internalLink.groupBy({
          by: ["targetSlug"],
          where: { exists: true, targetSlug: { in: candidateSlugs } },
          _count: { targetSlug: true }
        })
      : Promise.resolve([]),
    missingConcepts({ languages: languageValues, limit: 30 }),
    prisma.concept.findMany({
      where: {
        language: { in: languageValues },
        canAppearInConceptBrowser: true
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        slug: true,
        title: true,
        language: true,
        domain: true,
        domainCode: true,
        status: true,
        translationGroupId: true,
        translatedFromConceptId: true,
        needsReviewAfterEdit: true
      }
    }).then((concepts) => selectContentTranslationsByGroup(
      concepts.map((concept) => ({
        ...concept,
        isSource: concept.translatedFromConceptId === null
      })),
      preferredLanguage
    ))
  ]);
  const incomingLinkCountBySlug = new Map(
    incomingLinkGroups.map((item) => [item.targetSlug, item._count.targetSlug])
  );
  const sortedConcepts =
    sortValue === "linked"
      ? [...conceptCandidates]
          .sort((left, right) => {
            const rightCount = incomingLinkCountBySlug.get(right.slug) ?? 0;
            const leftCount = incomingLinkCountBySlug.get(left.slug) ?? 0;
            if (rightCount !== leftCount) return rightCount - leftCount;
            return right.updatedAt.getTime() - left.updatedAt.getTime();
          })
          .slice(0, 75)
      : conceptCandidates;
  const conceptOrder = new Map(sortedConcepts.map((concept, index) => [concept.id, index]));
  const concepts = query
    ? rankSearchMatches(
        sortedConcepts.map((concept) => ({
          item: concept,
          title: concept.title,
          slug: concept.slug,
          aliases: concept.aliases.map(({ alias }) => alias),
          language: concept.language,
          searchText: [concept.bodyMarkdown]
        })),
        query,
        preferredLanguage,
        morphologyVariants,
        (left, right) => (conceptOrder.get(left.item.id) ?? 0) - (conceptOrder.get(right.item.id) ?? 0)
      ).slice(0, 75).map(({ item }) => item)
    : sortedConcepts;

  return (
    <ForestPageLayout
      className="concepts-page-shell"
      title={t.concepts.title}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      actions={
        <>
          <Link href="/concepts/random" prefetch={false} className="button secondary concept-browser-action-button">
            {t.concepts.random}
          </Link>
          <Link href="/concepts/new" className="button concept-browser-action-button">
            {t.concepts.new}
          </Link>
          <ContributionRequestDialog
            action={createContributionRequestAction.bind(null, "CONCEPT", "/concepts")}
            buttonClassName="concept-browser-action-button"
            buttonLabel={t.concepts.requestConcept}
            closeLabel={t.contributingPage.closeRequestDialog}
            title={t.concepts.requestConcept}
            description={t.concepts.requestConceptDescription}
            placeholder={t.concepts.requestConceptPlaceholder}
            submitLabel={t.contributingPage.sendRequest}
          />
        </>
      }
      workspaceClassName="concept-browser-workspace"
    >
      <div className="concept-browser-layout">
        <aside className="concept-filter-panel">
          <LiveSearchForm className="concept-filter-form" persistKey="concepts">
            <label className="concept-filter-search">
              <span>{t.common.search}</span>
              <input name="q" defaultValue={query} placeholder={t.concepts.searchPlaceholder} />
            </label>
            <div className="concept-filter-section">
              <select name="domain" defaultValue={domainValue ?? ""}>
                <option value="">{t.concepts.anyDomain}</option>
                {PROBLEM_DOMAINS.flatMap((item) => [
                  <option key={item.value} value={item.value}>{translatedDomainLabel(item.value, t)}</option>,
                  ...(item.children ?? []).map((subdomain) => (
                    <option key={subdomain.value} value={subdomain.value}>
                      {"  - "}{translatedDomainLabel(subdomain.value, t)}
                    </option>
                  ))
                ])}
              </select>
              <select name="kind" defaultValue={kindValue ?? ""} aria-label={t.concepts.kind}>
                <option value="">{t.concepts.anyKind}</option>
                <option value="DEFINITION">{t.concepts.kinds.DEFINITION}</option>
                <option value="THEOREM">{t.concepts.kinds.THEOREM}</option>
                <option value="INTUITIVE_NOTION">{t.concepts.kinds.INTUITIVE_NOTION}</option>
                <option value="NOTATION">{t.concepts.kinds.NOTATION}</option>
              </select>
              <select name="status" defaultValue={statusValue ?? ""}>
                <option value="">{t.concepts.anyStatus}</option>
                <option value="STUB">{t.concepts.statuses.STUB}</option>
                <option value="USABLE">{t.concepts.statuses.USABLE}</option>
                <option value="REVIEWED">{t.concepts.statuses.REVIEWED}</option>
                <option value="EXCELLENT">{t.concepts.statuses.EXCELLENT}</option>
                <option value="CONTROVERSIAL">{t.concepts.statuses.CONTROVERSIAL}</option>
              </select>
              {canFilterByProblemLinks && (
                <select name="problemLinks" defaultValue={problemLinkFilter} aria-label={t.concepts.problemLinksFilter}>
                  <option value="all">{t.concepts.allProblemLinks}</option>
                  <option value="with">{t.concepts.withLinkedProblems}</option>
                  <option value="without">{t.concepts.withoutLinkedProblems}</option>
                </select>
              )}
            </div>
            <div className="concept-filter-section">
              <select
                name="missingTranslation"
                defaultValue={missingTranslationValue}
                aria-label={t.concepts.missingTranslationFilter}
              >
                <option value="">{t.concepts.anyTranslationCoverage}</option>
                <option value="fr">{t.concepts.missingFrenchTranslation}</option>
                <option value="en">{t.concepts.missingEnglishTranslation}</option>
              </select>
              <fieldset className="problem-language-filter concept-language-filter">
                <legend>{t.concepts.languages}</legend>
                {ACTIVE_CONTENT_LANGUAGES.map((languageOption) => (
                  <label key={languageOption.code}>
                    <input
                      name="language"
                      type="checkbox"
                      value={languageOption.code}
                      defaultChecked={languageValues.includes(languageOption.code)}
                    />
                    <span>{languageOption.code.toUpperCase()}</span>
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="concept-filter-section">
              <span className="concept-filter-section-title">{t.concepts.exerciseCountLabel}</span>
              <div className="concept-exercise-count-filter">
                <div className="concept-exercise-count-controls">
                  <select aria-label={t.concepts.exerciseCountModeAriaLabel} defaultValue={exerciseCountModeValue} name="exerciseCountMode">
                    <option value="at-least">{t.concepts.exerciseCountAtLeast}</option>
                    <option value="at-most">{t.concepts.exerciseCountAtMost}</option>
                  </select>
                  <input aria-label={t.concepts.exerciseCountAriaLabel} defaultValue={exerciseCountValue ?? 0} max={MAX_CONCEPT_EXERCISES} min={0} name="exerciseCount" type="number" />
                </div>
              </div>
            </div>
            <div className="concept-filter-section">
              <select name="sort" defaultValue={sortValue === "linked" ? "linked" : ""} aria-label={t.concepts.sortAriaLabel}>
                <option value="">{t.concepts.sortUpdated}</option>
                <option value="linked">{t.concepts.sortMostLinked}</option>
              </select>
            </div>
            <button type="submit">{t.common.search}</button>
          </LiveSearchForm>
        </aside>

        <section className="concept-ledger" aria-label={t.concepts.title}>
          <header className="concept-ledger-header">
            <p className="result-summary" role="status">{t.concepts.conceptsShown(concepts.length)}</p>
          </header>
          <div className="concept-ledger-list">
            {concepts.map((concept) => (
              <Link
                key={concept.id}
                href={contentLanguageViewHref("/concepts", concept.slug, concept.language) as Route}
                className={`concept-ledger-row concept-ledger-status-${concept.status.toLowerCase()}`}
              >
                <div className="concept-ledger-main">
                  <div className="concept-ledger-title-row">
                    <h2><AsyncMarkdownInline markdown={concept.title} /><ContentLanguageFallback language={concept.language} expectedLanguage={preferredLanguage} /></h2>
                    <ConceptStatusBadge
                      status={concept.status}
                      label={t.concepts.statuses[concept.status] ?? concept.status.toLowerCase()}
                    />
                    {concept.needsReviewAfterEdit && (
                      <ConceptEditedBadge label={t.conceptDetail.editedSinceReview} />
                    )}
                  </div>
                  <p className="concept-ledger-meta">
                    <span>{t.concepts.kinds[concept.kind]}</span>
                    <span>{translatedDomainLabel(concept.domainCode, t)}</span>
                    <span>{t.concepts.incomingLinks(incomingLinkCountBySlug.get(concept.slug) ?? 0)}</span>
                    <span>{t.concepts.exerciseCountLabel}: {concept._count.practiceExercises}</span>
                  </p>
                  {concept.aliases.length > 0 && (
                    <p className="concept-ledger-aliases">{concept.aliases.map((alias) => alias.alias).join(", ")}</p>
                  )}
                </div>
                <span className="concept-ledger-updated">{t.common.updated} {concept.updatedAt.toLocaleDateString(interfaceLocale)}</span>
              </Link>
            ))}
            {concepts.length === 0 && <p className="empty-state">{t.concepts.noMatches}</p>}
          </div>
        </section>

        <aside className="concept-discovery-panel">
          {featuredConcepts.length > 0 && (
            <section className="concept-discovery-section">
              <h2>{t.concepts.featuredConcepts}</h2>
              <p>{t.concepts.featuredConceptsDescription}</p>
              <div className="concept-discovery-links">
                {featuredConcepts.map((concept) => (
                  <Link
                    key={concept.id}
                    href={contentLanguageViewHref("/concepts", concept.slug, concept.language) as Route}
                    className="featured-concept-link"
                  >
                    <strong><AsyncMarkdownInline markdown={concept.title} /><ContentLanguageFallback language={concept.language} expectedLanguage={preferredLanguage} /></strong>
                    <span>{translatedDomainLabel(concept.domainCode, t)} / {t.concepts.statuses[concept.status] ?? concept.status.toLowerCase()}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section className="concept-discovery-section">
            <h2>{t.concepts.missingConcepts}</h2>
            <p>{t.concepts.missingConceptsDescription}</p>
            <div className="concept-discovery-links">
              {missing.map((item) => {
                const hiddenSourceCount = Math.max(0, item.count - item.sources.length);
                return (
                  <div key={item.slug} className="missing-concept-card">
                    <Link href={`/concepts/new?title=${encodeURIComponent(item.title)}`} className="missing-concept-main">
                      <span className="wiki-link missing"><AsyncMarkdownInline markdown={item.title} /></span>
                      <span className="muted text-sm">{item.count}</span>
                    </Link>
                    {item.sources.length > 0 && (
                      <details className="missing-concept-sources">
                        <summary>{t.concepts.citedIn(item.count)}</summary>
                        <div>
                          {item.sources.map((source) => (
                            <Link key={`${source.sourceType}-${source.href}`} href={source.href as Route}>
                              <span>{sourceTypeLabel(source.sourceType, t.concepts)}</span>
                              <strong><AsyncMarkdownInline markdown={source.title} /></strong>
                              {source.label && <small>as "{source.label}"</small>}
                            </Link>
                          ))}
                          {hiddenSourceCount > 0 && <p className="muted text-xs">{t.concepts.moreCitations(hiddenSourceCount)}</p>}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
              {missing.length === 0 && <p className="muted text-sm">{t.concepts.noMissingConcepts}</p>}
            </div>
          </section>
        </aside>
      </div>
    </ForestPageLayout>
  );
}
