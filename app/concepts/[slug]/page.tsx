import Link from "next/link";
import { Eye } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ContentTranslations } from "@/components/ContentTranslations";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { toggleConceptWatchAction } from "@/lib/actions/concept-community-actions";
import { reportConceptAction } from "@/lib/actions/moderation-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { SUPPORTED_CONTENT_LANGUAGES } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

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
  const existingTranslationLanguages = new Set([concept.language, ...translations.map((translation) => translation.language)]);
  const targetTranslationLanguage =
    !existingTranslationLanguages.has(preferredLanguage)
      ? preferredLanguage
      : SUPPORTED_CONTENT_LANGUAGES.find((language) => !existingTranslationLanguages.has(language.code))?.code;
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
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <div className="reading-header mb-5">
          <h1>{concept.title}</h1>
          <p className="muted mt-1">
            {domainLabel(concept.domain)} · {concept.status.toLowerCase()}
            {concept.lastEditedBy ? ` · edited by ${displayNameForUser(concept.lastEditedBy)}` : ""}
          </p>
          <ContentTranslations
            currentLanguage={concept.language}
            hrefPrefix="/concepts"
            translations={translations}
            createHref={addTranslationHref}
          />
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
          <MarkdownBlock html={concept.bodyHtml} />
        </section>

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
          {concept.references.length === 0 && (
            <p className="empty-state">No references yet. Add reliable sources when editing this article.</p>
          )}
        </section>
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

        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">Backlinks</h2>
          <div className="grid gap-2 text-sm">
            {problemBacklinks.map((problem) => (
              <Link key={`p-${problem.id}`} href={`/problems/${problem.slug}`} className="underline">
                {problem.title}
              </Link>
            ))}
            {conceptBacklinks.map((item) => (
              <Link key={`c-${item.id}`} href={`/concepts/${item.slug}`} className="underline">
                {item.title}
              </Link>
            ))}
            {problemBacklinks.length + conceptBacklinks.length === 0 && <p className="muted">No backlinks.</p>}
          </div>
        </section>

        <section className="sidebar-section">
          <h2 className="mb-3 font-semibold">Outgoing links</h2>
          <div className="grid gap-2 text-sm">
            {outgoingLinks.map((link) => (
              <Link
                key={link.id}
                href={link.exists ? `/concepts/${link.targetSlug}` : `/concepts/new?title=${link.targetSlug}`}
                className={link.exists ? "wiki-link" : "wiki-link missing"}
              >
                {link.label ?? link.targetSlug}
              </Link>
            ))}
            {outgoingLinks.length === 0 && <p className="muted">No outgoing links.</p>}
          </div>
        </section>
      </aside>
    </div>
  );
}
