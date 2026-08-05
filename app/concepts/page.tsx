import { ConceptKind, ConceptStatus, MathDomain, Prisma } from "@prisma/client";
import type { Route } from "next";
import Link from "next/link";
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
import { getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { missingConcepts } from "@/lib/internal-links";
import { canUseAdminTools } from "@/lib/permissions";
import { getPreferredContentLanguage } from "@/lib/server-language";

export const dynamic = "force-dynamic";

function conceptTitleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .join(" ");
}

function sourceTypeLabel(sourceType: "PROBLEM" | "CONCEPT" | "PLAYLIST" | "PROOF", t: Dictionary["concepts"]) {
  return t.sourceTypes[sourceType];
}

function translatedDomainLabel(domain: MathDomain | string, t: Dictionary) {
  return translatedDomainOptionLabel(domain, t.home.domainLabels);
}

type ConceptSort = "updated" | "linked";
type ProblemLinkFilter = "all" | "with" | "without";

function parseConceptSort(value: string | undefined): ConceptSort {
  return value === "linked" ? "linked" : "updated";
}

function parseProblemLinkFilter(value: string | undefined): ProblemLinkFilter {
  if (value === "with" || value === "without") return value;
  return "all";
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
    minExercises?: string;
    problemLinks?: string;
    sort?: string;
    status?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const t = await getTranslations();
  const preferredLanguage = await getPreferredContentLanguage();
  const {
    q = "",
    domain = "",
    exerciseCount = "",
    exerciseCountMode = "",
    kind = "",
    minExercises = "",
    status = "",
    sort = "",
    problemLinks = ""
  } = await searchParams;
  const query = q.trim();
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
  const where: Prisma.ConceptWhereInput = {
    language: preferredLanguage,
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { bodyMarkdown: { contains: query, mode: "insensitive" } },
            { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }
          ]
        }
      : {}),
    ...domainWhere,
    ...(kindValue ? { kind: kindValue } : {}),
    ...(statusValue ? { status: statusValue } : {}),
    ...(!exerciseCountFilterActive
      ? {}
      : exerciseCountModeValue === "at-most"
        ? { id: { notIn: exerciseCountBoundaryConceptIds } }
        : { id: { in: exerciseCountBoundaryConceptIds } }),
    ...(problemLinkFilter === "with"
      ? { slug: { in: linkedConceptSlugs } }
      : problemLinkFilter === "without"
        ? { slug: { notIn: linkedConceptSlugs } }
        : {})
  };

  const conceptCandidates = await prisma.concept.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    ...(sortValue === "updated" ? { take: 75 } : {}),
    include: {
      aliases: true,
      _count: { select: { practiceExercises: true, references: true, talkPosts: true } }
    }
  });
  const candidateSlugs = conceptCandidates.map((concept) => concept.slug);

  const [incomingLinkGroups, missing, featuredConcepts] = await Promise.all([
    candidateSlugs.length
      ? prisma.internalLink.groupBy({
          by: ["targetSlug"],
          where: { exists: true, targetSlug: { in: candidateSlugs } },
          _count: { targetSlug: true }
        })
      : Promise.resolve([]),
    missingConcepts(30),
    prisma.concept.findMany({
      where: {
        language: preferredLanguage,
        canAppearInConceptBrowser: true
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        slug: true,
        title: true,
        domain: true,
        domainCode: true,
        status: true,
        needsReviewAfterEdit: true
      }
    })
  ]);
  const incomingLinkCountBySlug = new Map(
    incomingLinkGroups.map((item) => [item.targetSlug, item._count.targetSlug])
  );
  const concepts =
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

  return (
    <ForestPageLayout
      className="concepts-page-shell"
      title={t.concepts.title}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      meta={
        <>
          <p>{t.concepts.conceptsShown(concepts.length)}</p>
          <p>{t.concepts.linkedGaps(missing.length)}</p>
        </>
      }
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
            title={t.concepts.requestConcept}
            description={t.concepts.requestConceptDescription}
            placeholder={t.concepts.requestConceptPlaceholder}
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
              <span className="concept-filter-section-title">{t.concepts.exerciseCountLabel}</span>
              <div className="concept-exercise-count-filter">
                <div className="concept-exercise-count-controls">
                  <select aria-label={t.concepts.exerciseCountModeAriaLabel} defaultValue={exerciseCountModeValue} name="exerciseCountMode">
                    <option value="at-least">{t.concepts.exerciseCountAtLeast}</option>
                    <option value="at-most">{t.concepts.exerciseCountAtMost}</option>
                  </select>
                  <input aria-label={t.concepts.exerciseCountAriaLabel} defaultValue={exerciseCountValue ?? ""} max={MAX_CONCEPT_EXERCISES} min={0} name="exerciseCount" placeholder="X" type="number" />
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
                href={`/concepts/${concept.slug}`}
                className={`concept-ledger-row concept-ledger-status-${concept.status.toLowerCase()}`}
              >
                <div className="concept-ledger-main">
                  <div className="concept-ledger-title-row">
                    <h2>{concept.title}</h2>
                    <span className={`concept-status-badge concept-status-${concept.status.toLowerCase()}`}>
                      {t.concepts.statuses[concept.status] ?? concept.status.toLowerCase()}
                    </span>
                    {concept.needsReviewAfterEdit && (
                      <span className="concept-status-badge concept-status-edited">
                        {t.conceptDetail.editedSinceReview}
                      </span>
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
                <span className="concept-ledger-updated">{t.common.updated} {concept.updatedAt.toLocaleDateString("en-US")}</span>
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
                  <Link key={concept.id} href={`/concepts/${concept.slug}`} className="featured-concept-link">
                    <strong>{concept.title}</strong>
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
                const title = conceptTitleFromSlug(item.slug);
                const hiddenSourceCount = Math.max(0, item.count - item.sources.length);
                return (
                  <div key={item.slug} className="missing-concept-card">
                    <Link href={`/concepts/new?title=${encodeURIComponent(title)}`} className="missing-concept-main">
                      <span className="wiki-link missing">{title}</span>
                      <span className="muted text-sm">{item.count}</span>
                    </Link>
                    {item.sources.length > 0 && (
                      <details className="missing-concept-sources">
                        <summary>{t.concepts.citedIn(item.count)}</summary>
                        <div>
                          {item.sources.map((source) => (
                            <Link key={`${source.sourceType}-${source.href}`} href={source.href as Route}>
                              <span>{sourceTypeLabel(source.sourceType, t.concepts)}</span>
                              <strong>{source.title}</strong>
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
