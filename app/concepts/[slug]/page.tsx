import type { Metadata } from "next";
import { MathDomain } from "@prisma/client";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import Link from "next/link";
import { Eye } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ContentTranslations } from "@/components/ContentTranslations";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { toggleConceptWatchAction } from "@/lib/actions/concept-community-actions";
import { reportConceptAction } from "@/lib/actions/moderation-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { contentLanguageLabel, parseContentLanguage } from "@/lib/languages";
import { markdownExcerpt } from "@/lib/metadata-text";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { renderMarkdownForContentLanguage, resolveConceptHrefsForLanguage } from "@/lib/translated-markdown";
import { conceptTranslationFreshness } from "@/lib/translation-freshness";
import { nextMissingTranslationLanguage, preferredTranslationForLanguage } from "@/lib/translation-routing";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

function translatedDomainLabel(domain: MathDomain | string, t: Dictionary) {
  return Object.values(MathDomain).includes(domain as MathDomain)
    ? (t.home.domainLabels[domain as MathDomain] ?? domainLabel(domain))
    : domainLabel(domain);
}

function titleFromConceptSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .join(" ");
}

function uniqueLinksByTargetSlug<T extends { targetSlug: string }>(links: T[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.targetSlug)) return false;
    seen.add(link.targetSlug);
    return true;
  });
}

async function resolveConceptTitlesForLanguage(slugs: readonly string[], language: string) {
  const uniqueSlugs = [...new Set(slugs)];
  if (uniqueSlugs.length === 0) return new Map<string, string>();

  const targetLanguage = parseContentLanguage(language);
  const concepts = await prisma.concept.findMany({
    where: { slug: { in: uniqueSlugs } },
    select: { slug: true, title: true, translationGroupId: true }
  });
  if (concepts.length === 0) return new Map<string, string>();

  const translatedConcepts = await prisma.concept.findMany({
    where: {
      translationGroupId: { in: [...new Set(concepts.map((concept) => concept.translationGroupId))] },
      language: targetLanguage
    },
    select: { title: true, translationGroupId: true }
  });
  const translatedTitleByGroup = new Map(
    translatedConcepts.map((concept) => [concept.translationGroupId, concept.title])
  );

  return new Map(
    concepts.map((concept) => [
      concept.slug,
      translatedTitleByGroup.get(concept.translationGroupId) ?? concept.title
    ])
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const concept = await prisma.concept.findUnique({
    where: { slug },
    select: {
      slug: true,
      title: true,
      bodyMarkdown: true,
      translationGroupId: true
    }
  });
  if (!concept) return {};

  const translations = await prisma.concept.findMany({
    where: { translationGroupId: concept.translationGroupId },
    select: { slug: true, language: true }
  });
  const description = markdownExcerpt(concept.bodyMarkdown, "A Math Woods concept.");

  return {
    title: `${concept.title} - Math Woods`,
    description,
    alternates: {
      canonical: `/concepts/${concept.slug}`,
      languages: Object.fromEntries(
        translations.map((translation) => [translation.language, `/concepts/${translation.slug}`])
      )
    },
    openGraph: {
      title: concept.title,
      description,
      url: `/concepts/${concept.slug}`,
      siteName: "Math Woods",
      type: "article"
    },
    twitter: {
      card: "summary",
      title: concept.title,
      description
    }
  };
}

export default async function ConceptPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const t = await getTranslations();
  const preferredLanguage = await getPreferredContentLanguage();
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: {
      createdBy: true,
      lastEditedBy: true,
      aliases: { orderBy: { alias: "asc" } },
      references: { orderBy: { position: "asc" } },
      translatedFromConcept: {
        select: { id: true, slug: true, title: true, language: true }
      },
      _count: { select: { talkPosts: true, watchers: true } }
    }
  });

  if (!concept) {
    const alias = await prisma.conceptAlias.findUnique({
      where: { aliasSlug: slug },
      include: { concept: true }
    });
    if (alias) redirect(`/concepts/${alias.concept.slug}`);
    notFound();
  }

  const [translations, outgoingLinks, backlinks, watched] = await Promise.all([
    prisma.concept.findMany({
      where: {
        translationGroupId: concept.translationGroupId,
        id: { not: concept.id }
      },
      select: { slug: true, title: true, language: true },
      orderBy: { language: "asc" }
    }),
    prisma.internalLink.findMany({
      where: { sourceType: "CONCEPT", sourceId: concept.id },
      orderBy: { targetSlug: "asc" }
    }),
    prisma.internalLink.findMany({
      where: { targetSlug: concept.slug, exists: true },
      orderBy: { createdAt: "desc" }
    }),
    user
      ? prisma.conceptWatch.findUnique({
          where: { userId_conceptId: { userId: user.id, conceptId: concept.id } }
        })
      : null
  ]);
  const preferredTranslation = preferredTranslationForLanguage(concept.language, translations, preferredLanguage);
  if (preferredTranslation?.slug && preferredTranslation.slug !== concept.slug) {
    redirect(`/concepts/${preferredTranslation.slug}`);
  }
  const uniqueOutgoingLinks = uniqueLinksByTargetSlug(outgoingLinks);
  const existingOutgoingSlugs = uniqueOutgoingLinks.filter((link) => link.exists).map((link) => link.targetSlug);
  const [conceptBodyHtml, translationFreshness, outgoingConceptHrefBySlug, outgoingConceptTitleBySlug] = await Promise.all([
    renderMarkdownForContentLanguage(concept.bodyMarkdown, concept.language),
    conceptTranslationFreshness(concept.translatedFromConcept, concept.translatedFromRevisionId),
    resolveConceptHrefsForLanguage(
      existingOutgoingSlugs,
      concept.language
    ),
    resolveConceptTitlesForLanguage(existingOutgoingSlugs, concept.language)
  ]);
  const isLanguageFallback = preferredLanguage !== concept.language;
  const conceptStatusLabel = t.concepts.statuses[concept.status] ?? concept.status.toLowerCase();
  const conceptDomainLabel = translatedDomainLabel(concept.domain, t);

  const targetTranslationLanguage = nextMissingTranslationLanguage(concept.language, translations, preferredLanguage);
  const addTranslationHref = targetTranslationLanguage
    ? `/concepts/new?translateOf=${concept.slug}&language=${targetTranslationLanguage}`
    : undefined;

  const conceptLookupSlugs = [concept.slug, ...concept.aliases.map((alias) => alias.aliasSlug)];
  const [problemBacklinks, conceptBacklinks, spoilerProblemBacklinksRaw] = await Promise.all([
    prisma.problem.findMany({
      where: {
        status: "PUBLISHED",
        listed: true,
        id: {
          in: backlinks.filter((link) => link.sourceType === "PROBLEM").map((link) => link.sourceId)
        }
      },
      select: { id: true, slug: true, title: true }
    }),
    prisma.concept.findMany({
      where: {
        id: {
          in: backlinks.filter((link) => link.sourceType === "CONCEPT").map((link) => link.sourceId)
        }
      },
      select: { id: true, slug: true, title: true }
    }),
    prisma.problem.findMany({
      where: {
        status: "PUBLISHED",
        listed: true,
        language: concept.language,
        spoilerTags: {
          some: {
            tag: {
              slug: { in: conceptLookupSlugs }
            }
          }
        }
      },
      select: { id: true, slug: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 30
    })
  ]);
  const problemBacklinkIds = new Set(problemBacklinks.map((problem) => problem.id));
  const spoilerProblemBacklinks = spoilerProblemBacklinksRaw.filter((problem) => !problemBacklinkIds.has(problem.id));

  return (
    <ForestPageLayout
      title={concept.title}
      eyebrow={t.conceptDetail.concept}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={
        <>
          {t.conceptDetail.statusLabel(conceptDomainLabel, conceptStatusLabel)}
          {concept.lastEditedBy ? ` / ${t.conceptDetail.editedBy(displayNameForUser(concept.lastEditedBy))}` : ""}
        </>
      }
      meta={
        <>
          <p>{t.conceptDetail.watchers(concept._count.watchers)}</p>
          <p>{t.conceptDetail.talkPosts(concept._count.talkPosts)}</p>
        </>
      }
    >
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <div className="reading-header mb-5">
          <ContentTranslations
            currentLanguage={concept.language}
            hrefPrefix="/concepts"
            translations={translations}
            addTranslationLabel={t.translations.addTranslation}
            createHref={addTranslationHref}
          />
          {isLanguageFallback && (
            <p className="quality-banner quality-unreviewed mb-4 text-sm">
              {t.translations.fallbackNotice(contentLanguageLabel(concept.language), contentLanguageLabel(preferredLanguage))}
              {addTranslationHref && (
                <>
                  {" "}
                  <Link href={addTranslationHref as never} className="underline">
                    {t.translations.addThatTranslation}
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          {translationFreshness?.stale && (
            <p className="quality-banner quality-needs-work mb-4 text-sm">
              {t.translations.staleNotice(translationFreshness.basedOnRevisionId)}{" "}
              <Link href={translationFreshness.sourceHref as never} className="underline">
                {t.translations.compareWith(translationFreshness.sourceTitle)}
              </Link>
              .
            </p>
          )}
          {concept.aliases.length > 0 && (
            <p className="muted mt-1 text-sm">{t.conceptDetail.alsoKnownAs} {concept.aliases.map((alias) => alias.alias).join(", ")}</p>
          )}
        </div>

        <nav className="tab-nav">
          <span>{t.conceptDetail.article}</span>
          <Link href={`/concepts/${concept.slug}/talk`}>
            {t.conceptDetail.talk} · {concept._count.talkPosts}
          </Link>
          <Link href={`/concepts/${concept.slug}/history`}>
            {t.conceptDetail.history}
          </Link>
        </nav>

        {concept.status === "STUB" && (
          <p className="quality-banner quality-stub mb-4">
            {t.conceptDetail.stubNotice}
          </p>
        )}
        {concept.status === "CONTROVERSIAL" && (
          <p className="quality-banner quality-controversial mb-4">
            {t.conceptDetail.controversialNotice}
          </p>
        )}

        <section className="reading-surface">
          <MarkdownBlock html={conceptBodyHtml} />
        </section>

        <div className="concept-problem-boxes">
          <details className="concept-problem-box">
            <summary>
              <span>{t.conceptDetail.problemsUsingConcept(problemBacklinks.length)}</span>
            </summary>
            <div className="concept-problem-list">
              {problemBacklinks.map((problem) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`} className="concept-problem-link">
                  <AsyncMarkdownInline markdown={problem.title} />
                </Link>
              ))}
              {problemBacklinks.length === 0 && <p>{t.conceptDetail.noProblemsUsingConcept}</p>}
            </div>
          </details>

          <details className="concept-problem-box">
            <summary>
              <span>{t.conceptDetail.spoilerProblemsUsingConcept(spoilerProblemBacklinks.length)}</span>
            </summary>
            <div className="concept-problem-list">
              {spoilerProblemBacklinks.map((problem) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`} className="concept-problem-link">
                  <AsyncMarkdownInline markdown={problem.title} />
                </Link>
              ))}
              {spoilerProblemBacklinks.length === 0 && <p>{t.conceptDetail.noSpoilerProblemsUsingConcept}</p>}
            </div>
          </details>
        </div>

        {concept.references.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">{t.conceptDetail.references}</h2>
          <ol className="grid list-decimal gap-3 pl-6 text-sm">
            {concept.references.map((reference) => (
              <li key={reference.id}>
                {reference.url ? (
                  <a href={reference.url} rel="noopener noreferrer" className="underline">
                    {reference.title}
                  </a>
                ) : (
                  <span>{reference.title}</span>
                )}
                {reference.note && <span className="muted"> — {reference.note}</span>}
              </li>
            ))}
          </ol>
        </section>
        )}
      </article>

      <aside className="grid content-start gap-5">
        <section className="action-surface">
          {user && (
            <form action={toggleConceptWatchAction.bind(null, concept.id, concept.slug)}>
              <button type="submit" className="secondary w-full">
                <Eye size={17} fill={watched ? "currentColor" : "none"} />
                {watched ? t.conceptDetail.watching : t.conceptDetail.watch} · {concept._count.watchers}
              </button>
            </form>
          )}
          <Link href={`/concepts/${concept.slug}/edit`} className="button secondary">
            {t.conceptDetail.edit}
          </Link>
          <Link href={`/concepts/${concept.slug}/export`} className="button secondary">
            {t.conceptDetail.exportMarkdown}
          </Link>
          <Link href={`/concepts/${concept.slug}/history`} className="button secondary">
            {t.conceptDetail.history}
          </Link>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">{t.conceptDetail.report}</summary>
            <form action={reportConceptAction.bind(null, concept.id)} className="mt-3 grid gap-2">
              <textarea name="reason" placeholder={t.conceptDetail.reportPlaceholder} required />
              <button type="submit" className="secondary">
                {t.conceptDetail.submit}
              </button>
            </form>
          </details>
        </section>

        {problemBacklinks.length + conceptBacklinks.length > 0 && (
        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">{t.conceptDetail.backlinks}</h2>
          <div className="grid gap-2 text-sm">
            {problemBacklinks.map((problem) => (
              <Link key={`p-${problem.id}`} href={`/problems/${problem.slug}`} className="underline">
                <AsyncMarkdownInline markdown={problem.title} />
              </Link>
            ))}
            {conceptBacklinks.map((item) => (
              <Link key={`c-${item.id}`} href={`/concepts/${item.slug}`} className="underline">
                {item.title}
              </Link>
            ))}
          </div>
        </section>
        )}

        {uniqueOutgoingLinks.length > 0 && (
        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">{t.conceptDetail.outgoingLinks}</h2>
          <div className="grid gap-2 text-sm">
            {uniqueOutgoingLinks.map((link) => {
              const title = outgoingConceptTitleBySlug.get(link.targetSlug) ?? titleFromConceptSlug(link.targetSlug);

              return (
                <Link
                  key={link.id}
                  href={(link.exists ? (outgoingConceptHrefBySlug.get(link.targetSlug) ?? `/concepts/${link.targetSlug}`) : `/concepts/new?title=${encodeURIComponent(title)}`) as never}
                  className={link.exists ? "wiki-link" : "wiki-link missing"}
                >
                  {title}
                </Link>
              );
            })}
          </div>
        </section>
        )}
      </aside>
    </div>
    </ForestPageLayout>
  );
}
