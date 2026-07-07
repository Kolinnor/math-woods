import { ConceptStatus, MathDomain, Prisma } from "@prisma/client";
import type { Route } from "next";
import Link from "next/link";
import { ContributionRequestDialog } from "@/components/ContributionRequestDialog";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { createContributionRequestAction } from "@/lib/actions/contribution-request-actions";
import { prisma } from "@/lib/db";
import { coarseDomainForCode, domainCodeAliases, domainLabel, parseDomainCode, PROBLEM_DOMAINS } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { missingConcepts } from "@/lib/internal-links";
import { getPreferredContentLanguage } from "@/lib/server-language";

export const dynamic = "force-dynamic";

function conceptTitleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function sourceTypeLabel(sourceType: "PROBLEM" | "CONCEPT" | "PLAYLIST", t: Dictionary["concepts"]) {
  return t.sourceTypes[sourceType];
}

function translatedDomainLabel(domain: MathDomain, t: Dictionary) {
  return t.home.domainLabels[domain] ?? domainLabel(domain);
}

type ConceptSort = "updated" | "linked";

function parseConceptSort(value: string | undefined): ConceptSort {
  return value === "linked" ? "linked" : "updated";
}

export default async function ConceptsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; domain?: string; status?: string; sort?: string }>;
}) {
  const t = await getTranslations();
  const preferredLanguage = await getPreferredContentLanguage();
  const { q = "", domain = "", status = "", sort = "" } = await searchParams;
  const query = q.trim();
  const sortValue = parseConceptSort(sort);
  const domainValue = domain ? parseDomainCode(domain) : undefined;
  const domainFilterValues = domainValue
    ? [
        coarseDomainForCode(domainValue),
        ...domainCodeAliases(domainValue).filter((value): value is MathDomain =>
          Object.values(MathDomain).includes(value as MathDomain)
        )
      ]
    : [];
  const statusValue = Object.values(ConceptStatus).includes(status as ConceptStatus)
    ? (status as ConceptStatus)
    : undefined;
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
    ...(domainValue ? { domain: { in: [...new Set(domainFilterValues)] } } : {}),
    ...(statusValue ? { status: statusValue } : {})
  };

  const conceptCandidates = await prisma.concept.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    ...(sortValue === "updated" ? { take: 75 } : {}),
    include: {
      aliases: true,
      _count: { select: { references: true, talkPosts: true } }
    }
  });
  const candidateSlugs = conceptCandidates.map((concept) => concept.slug);

  const [incomingLinkGroups, missing] = await Promise.all([
    candidateSlugs.length
      ? prisma.internalLink.groupBy({
          by: ["targetSlug"],
          where: { exists: true, targetSlug: { in: candidateSlugs } },
          _count: { targetSlug: true }
        })
      : Promise.resolve([]),
    missingConcepts(30)
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
          <Link href="/contributing" className="button secondary">
            {t.concepts.guidelines}
          </Link>
          <Link href="/concepts/random" className="button secondary">
            {t.concepts.random}
          </Link>
          <Link href="/recent-changes" className="button secondary">
            {t.concepts.recentChanges}
          </Link>
          <Link href="/watchlist" className="button secondary">
            {t.concepts.watchlist}
          </Link>
          <Link href="/concepts/new" className="button">
            {t.concepts.new}
          </Link>
          <ContributionRequestDialog
            action={createContributionRequestAction.bind(null, "CONCEPT", "/concepts")}
            buttonLabel={t.concepts.requestConcept}
            title={t.concepts.requestConcept}
            description={t.concepts.requestConceptDescription}
            placeholder={t.concepts.requestConceptPlaceholder}
          />
        </>
      }
      sidebar={
        <>
        <h2 className="mb-3 font-semibold">{t.concepts.missingConcepts}</h2>
        <p className="muted mb-4 text-sm">{t.concepts.missingConceptsDescription}</p>
        <div className="grid gap-2">
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
        </>
      }
    >
      <LiveSearchForm className="filter-bar mb-6 grid gap-3 p-4 md:grid-cols-[1fr_12rem_12rem_12rem_auto]">
        <input name="q" defaultValue={query} placeholder={t.concepts.searchPlaceholder} />
        <select name="domain" defaultValue={domainValue ?? ""}>
          <option value="">{t.concepts.anyDomain}</option>
          {PROBLEM_DOMAINS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={statusValue ?? ""}>
          <option value="">{t.concepts.anyStatus}</option>
          <option value="STUB">{t.concepts.statuses.STUB}</option>
          <option value="USABLE">{t.concepts.statuses.USABLE}</option>
          <option value="REVIEWED">{t.concepts.statuses.REVIEWED}</option>
          <option value="EXCELLENT">{t.concepts.statuses.EXCELLENT}</option>
          <option value="CONTROVERSIAL">{t.concepts.statuses.CONTROVERSIAL}</option>
        </select>
        <select name="sort" defaultValue={sortValue === "linked" ? "linked" : ""} aria-label={t.concepts.sortAriaLabel}>
          <option value="">{t.concepts.sortUpdated}</option>
          <option value="linked">{t.concepts.sortMostLinked}</option>
        </select>
        <button type="submit">{t.common.search}</button>
      </LiveSearchForm>

      <div className="list-surface">
        {concepts.map((concept) => (
          <Link key={concept.id} href={`/concepts/${concept.slug}`} className="list-row block">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{concept.title}</h2>
                <p className="meta">
                  {translatedDomainLabel(concept.domain, t)} / {t.concepts.statuses[concept.status] ?? concept.status.toLowerCase()} /{" "}
                  {t.concepts.incomingLinks(incomingLinkCountBySlug.get(concept.slug) ?? 0)} / {t.concepts.sources(concept._count.references)} /{" "}
                  {t.concepts.talkPosts(concept._count.talkPosts)}
                </p>
                {concept.aliases.length > 0 && (
                  <p className="muted mt-1 text-xs">{concept.aliases.map((alias) => alias.alias).join(", ")}</p>
                )}
              </div>
              <span className="meta">{t.common.updated} {concept.updatedAt.toLocaleDateString("en-US")}</span>
            </div>
          </Link>
        ))}
        {concepts.length === 0 && <p className="empty-state">{t.concepts.noMatches}</p>}
      </div>
    </ForestPageLayout>
  );
}
