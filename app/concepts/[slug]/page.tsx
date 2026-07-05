import type { Metadata } from "next";
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
import { contentLanguageLabel } from "@/lib/languages";
import { markdownExcerpt } from "@/lib/metadata-text";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { renderMarkdownForContentLanguage, resolveConceptHrefsForLanguage } from "@/lib/translated-markdown";
import { conceptTranslationFreshness } from "@/lib/translation-freshness";
import { nextMissingTranslationLanguage, preferredTranslationForLanguage } from "@/lib/translation-routing";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

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
  const [conceptBodyHtml, translationFreshness, outgoingConceptHrefBySlug] = await Promise.all([
    renderMarkdownForContentLanguage(concept.bodyMarkdown, concept.language),
    conceptTranslationFreshness(concept.translatedFromConcept, concept.translatedFromRevisionId),
    resolveConceptHrefsForLanguage(
      outgoingLinks.filter((link) => link.exists).map((link) => link.targetSlug),
      concept.language
    )
  ]);
  const isLanguageFallback = preferredLanguage !== concept.language;

  const targetTranslationLanguage = nextMissingTranslationLanguage(concept.language, translations, preferredLanguage);
  const addTranslationHref = targetTranslationLanguage
    ? `/concepts/new?translateOf=${concept.slug}&language=${targetTranslationLanguage}`
    : undefined;

  const [problemBacklinks, conceptBacklinks] = await Promise.all([
    prisma.problem.findMany({
      where: {
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
    })
  ]);

  return (
    <ForestPageLayout
      title={concept.title}
      eyebrow="Concept"
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={
        <>
          {domainLabel(concept.domain)} / {concept.status.toLowerCase()}
          {concept.lastEditedBy ? ` / edited by ${displayNameForUser(concept.lastEditedBy)}` : ""}
        </>
      }
      meta={
        <>
          <p>{concept._count.watchers} watchers</p>
          <p>{concept._count.talkPosts} talk posts</p>
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
            createHref={addTranslationHref}
          />
          {isLanguageFallback && (
            <p className="quality-banner quality-unreviewed mb-4 text-sm">
              Showing the {contentLanguageLabel(concept.language)} version because no {contentLanguageLabel(preferredLanguage)} translation exists yet.
              {addTranslationHref && (
                <>
                  {" "}
                  <Link href={addTranslationHref as never} className="underline">
                    Add that translation
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          {translationFreshness?.stale && (
            <p className="quality-banner quality-needs-work mb-4 text-sm">
              This translation may be outdated. Its source page has changed since revision{" "}
              {translationFreshness.basedOnRevisionId}.{" "}
              <Link href={translationFreshness.sourceHref as never} className="underline">
                Compare with {translationFreshness.sourceTitle}
              </Link>
              .
            </p>
          )}
          {concept.aliases.length > 0 && (
            <p className="muted mt-1 text-sm">Also known as: {concept.aliases.map((alias) => alias.alias).join(", ")}</p>
          )}
        </div>

        <nav className="tab-nav">
          <span>Article</span>
          <Link href={`/concepts/${concept.slug}/talk`}>
            Talk · {concept._count.talkPosts}
          </Link>
          <Link href={`/concepts/${concept.slug}/history`}>
            History
          </Link>
        </nav>

        {concept.status === "STUB" && (
          <p className="quality-banner quality-stub mb-4">
            This article is a stub. It needs a fuller definition, examples, and reliable references.
          </p>
        )}
        {concept.status === "CONTROVERSIAL" && (
          <p className="quality-banner quality-controversial mb-4">
            This article is marked controversial. Check the talk page and sources before relying on it.
          </p>
        )}

        <section className="reading-surface">
          <MarkdownBlock html={conceptBodyHtml} />
        </section>

        {concept.references.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">References</h2>
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
                {watched ? "Watching" : "Watch"} · {concept._count.watchers}
              </button>
            </form>
          )}
          <Link href={`/concepts/${concept.slug}/edit`} className="button secondary">
            Edit
          </Link>
          <Link href={`/concepts/${concept.slug}/export`} className="button secondary">
            Export Markdown
          </Link>
          <Link href={`/concepts/${concept.slug}/history`} className="button secondary">
            History
          </Link>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Report</summary>
            <form action={reportConceptAction.bind(null, concept.id)} className="mt-3 grid gap-2">
              <textarea name="reason" placeholder="Ambiguous definition, conflict, missing source..." required />
              <button type="submit" className="secondary">
                Submit
              </button>
            </form>
          </details>
        </section>

        {problemBacklinks.length + conceptBacklinks.length > 0 && (
        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">Backlinks</h2>
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

        {outgoingLinks.length > 0 && (
        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">Outgoing links</h2>
          <div className="grid gap-2 text-sm">
            {outgoingLinks.map((link) => (
              <Link
                key={link.id}
                href={(link.exists ? (outgoingConceptHrefBySlug.get(link.targetSlug) ?? `/concepts/${link.targetSlug}`) : `/concepts/new?title=${link.targetSlug}`) as never}
                className={link.exists ? "wiki-link" : "wiki-link missing"}
              >
                {link.label ?? link.targetSlug}
              </Link>
            ))}
          </div>
        </section>
        )}
      </aside>
    </div>
    </ForestPageLayout>
  );
}
