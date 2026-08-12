import type { Metadata } from "next";
import { ConceptStatus, MathDomain, NotificationType } from "@prisma/client";
import { FileDown, Flag, History, MessageCircle, Pencil } from "lucide-react";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConceptPracticeQueue } from "@/components/ConceptPracticeQueue";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { ContentTranslations } from "@/components/ContentTranslations";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserAvatar } from "@/components/UserAvatar";
import {
  downgradeConceptStatusAction,
  dismissConceptTranslationStaleNoticeAction,
  markConceptReviewedAction,
  markConceptUsableAction
} from "@/lib/actions/concept-actions";
import { reportConceptAction } from "@/lib/actions/moderation-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { translatedDomainLabel as translatedDomainOptionLabel } from "@/lib/domains";
import { getTranslations } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/types";
import { contentLanguageLabel } from "@/lib/languages";
import { renderInlineMarkdown } from "@/lib/markdown";
import { markdownExcerpt } from "@/lib/metadata-text";
import { markNotificationsReadForHref } from "@/lib/notification-lifecycle";
import {
  canChangeConceptStatus,
  canDowngradeConceptStatus,
  canReviewConcept,
  canUseAdminTools
} from "@/lib/permissions";
import { problemDifficultyTone } from "@/lib/problem-difficulty";
import { visibleProblemWhere } from "@/lib/problem-visibility";
import { getPreferredContentLanguage } from "@/lib/server-language";
import {
  renderMarkdownForContentLanguage,
  resolveConceptHrefsForLanguage,
  resolveConceptTitlesForLanguage
} from "@/lib/translated-markdown";
import { conceptTranslationFreshness } from "@/lib/translation-freshness";
import {
  nextMissingTranslationLanguage,
  preferredTranslationForLanguage,
  requestedTranslationLanguage,
  TRANSLATION_VIEW_LANGUAGE_PARAM
} from "@/lib/translation-routing";
import { displayNameForUser } from "@/lib/user-display";
import { cleanWikiLinkTarget, missingConceptHref } from "@/lib/wikilinks";

export const dynamic = "force-dynamic";

function translatedDomainLabel(domain: MathDomain | string, t: Dictionary) {
  return translatedDomainOptionLabel(domain, t.home.domainLabels);
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

export default async function ConceptPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ viewLanguage?: string; missingTitle?: string }>;
}) {
  const { slug } = await params;
  const queryParams = searchParams ? await searchParams : {};
  const user = await getCurrentUser();
  const t = await getTranslations();
  const preferredLanguage = await getPreferredContentLanguage();
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: {
      createdBy: true,
      lastEditedBy: true,
      aliases: { orderBy: { alias: "asc" } },
      practiceExercises: {
        where: {
          problem: {
            isExercise: true,
            listed: true,
            status: "PUBLISHED",
            ...visibleProblemWhere(user)
          }
        },
        orderBy: { position: "asc" },
        select: {
          position: true,
          problem: {
            select: {
              id: true,
              slug: true,
              title: true,
              bodyMarkdown: true,
              language: true,
              difficulty: true,
              authorId: true,
              translationGroupId: true
            }
          }
        }
      },
      references: { orderBy: { position: "asc" } },
      translatedFromConcept: {
        select: { id: true, slug: true, title: true, language: true, createdById: true }
      },
      _count: { select: { talkPosts: true } }
    }
  });

  if (!concept) {
    const alias = await prisma.conceptAlias.findUnique({
      where: { aliasSlug: slug },
      include: { concept: true }
    });
    if (alias) redirect(`/concepts/${alias.concept.slug}`);

    const missingTitle =
      cleanWikiLinkTarget(queryParams.missingTitle ?? "") || titleFromConceptSlug(slug);
    const createConceptHref = `/concepts/new?title=${encodeURIComponent(missingTitle)}`;
    const contributionHref = user
      ? createConceptHref
      : `/login?returnTo=${encodeURIComponent(createConceptHref)}`;

    return (
      <ForestPageLayout
        title={missingTitle}
        eyebrow="Missing concept"
        heroImage="/art/birch-grove.jpg"
        heroAlt="Ivan Shishkin, Birch Grove"
        description="This concept does not exist yet."
        workspaceClassName="forest-page-workspace-narrow"
      >
        <section className="panel grid gap-4 p-5">
          <div className="grid gap-2">
            <h2 className="text-xl font-semibold">Help Math Woods grow</h2>
            <p>
              If you know about this concept, you can help create its page. A short definition,
              one example, or a reliable reference is enough for a useful first version.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={contributionHref as never} className="button">
              {user ? "Create this concept" : "Sign in to create this concept"}
            </Link>
            <Link href="/concepts" className="button secondary">
              Browse concepts
            </Link>
          </div>
        </section>
      </ForestPageLayout>
    );
  }
  if (user) {
    await markNotificationsReadForHref(user.id, `/concepts/${concept.slug}`, [
      NotificationType.CONCEPT_CREATED,
      NotificationType.CONCEPT_EDITED,
      NotificationType.DAILY_CONCEPT_REVIEW
    ]);
  }

  const practiceTranslationGroupIds = [
    ...new Set(concept.practiceExercises.map(({ problem }) => problem.translationGroupId))
  ];
  const [translations, outgoingLinks, backlinks, practiceSolvedAttempts] = await Promise.all([
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
    practiceTranslationGroupIds.length
      ? prisma.problemAttempt.findMany({
          where: {
            status: "SOLVED",
            problem: { translationGroupId: { in: practiceTranslationGroupIds } }
          },
          select: {
            userId: true,
            problem: { select: { translationGroupId: true } }
          }
        })
      : []
  ]);
  const solvedUsersByPracticeGroup = new Map<string, Set<number>>();
  for (const attempt of practiceSolvedAttempts) {
    const groupId = attempt.problem.translationGroupId;
    const solvedUsers = solvedUsersByPracticeGroup.get(groupId) ?? new Set<number>();
    solvedUsers.add(attempt.userId);
    solvedUsersByPracticeGroup.set(groupId, solvedUsers);
  }
  const requestedLanguage = requestedTranslationLanguage(queryParams.viewLanguage);
  const targetViewLanguage = requestedLanguage ?? preferredLanguage;
  const preferredTranslation = preferredTranslationForLanguage(concept.language, translations, targetViewLanguage);
  if (preferredTranslation?.slug && preferredTranslation.slug !== concept.slug) {
    const viewLanguageQuery = requestedLanguage
      ? `?${TRANSLATION_VIEW_LANGUAGE_PARAM}=${encodeURIComponent(requestedLanguage)}`
      : "";
    redirect(`/concepts/${preferredTranslation.slug}${viewLanguageQuery}`);
  }
  const uniqueOutgoingLinks = uniqueLinksByTargetSlug(outgoingLinks);
  const existingOutgoingSlugs = uniqueOutgoingLinks.filter((link) => link.exists).map((link) => link.targetSlug);
  const [
    conceptBodyHtml,
    translationFreshness,
    outgoingConceptHrefBySlug,
    outgoingConceptTitleBySlug,
    practiceExercises
  ] = await Promise.all([
    renderMarkdownForContentLanguage(concept.bodyMarkdown, concept.language),
    conceptTranslationFreshness(concept.translatedFromConcept, concept.translatedFromRevisionId),
    resolveConceptHrefsForLanguage(
      existingOutgoingSlugs,
      concept.language
    ),
    resolveConceptTitlesForLanguage(existingOutgoingSlugs, concept.language),
    Promise.all(
      [...concept.practiceExercises]
        .sort(
          (left, right) =>
            (left.problem.difficulty ?? 101) - (right.problem.difficulty ?? 101) ||
            left.position - right.position
        )
        .map(async ({ problem }) => {
          const solvedUsers = solvedUsersByPracticeGroup.get(problem.translationGroupId) ?? new Set<number>();
          const externalSolvedCount = [...solvedUsers].filter((userId) => userId !== problem.authorId).length;
          const [titleHtml, blurbHtml] = await Promise.all([
            renderInlineMarkdown(problem.title),
            renderMarkdownForContentLanguage(problem.bodyMarkdown, problem.language)
          ]);

          return {
            ...problem,
            titleHtml,
            difficultyTone: problemDifficultyTone(problem.difficulty),
            solved: Boolean(user && solvedUsers.has(user.id)),
            solvedCountLabel: t.problems.solvedCount(externalSolvedCount),
            blurbHtml
          };
        })
    )
  ]);
  const isLanguageFallback = targetViewLanguage !== concept.language;
  const conceptStatusLabel = t.concepts.statuses[concept.status] ?? concept.status.toLowerCase();
  const downgradeTargets = user
    ? [ConceptStatus.STUB, ConceptStatus.USABLE].filter((status) =>
        canDowngradeConceptStatus(user, concept, status)
      )
    : [];
  const conceptKindLabel = t.concepts.kinds[concept.kind];
  const conceptDomainLabel = translatedDomainLabel(concept.domainCode, t);
  const hasReadingHeader =
    isLanguageFallback ||
    Boolean(translationFreshness?.stale) ||
    concept.aliases.length > 0;

  const targetTranslationLanguage = nextMissingTranslationLanguage(concept.language, translations, targetViewLanguage);
  const addTranslationHref = targetTranslationLanguage
    ? `/concepts/${concept.slug}/translate?language=${targetTranslationLanguage}`
    : undefined;
  const canManageTranslationFreshness = Boolean(
    user &&
      translationFreshness?.stale &&
      concept.translatedFromConcept &&
      (concept.translatedFromConcept.createdById === user.id || canUseAdminTools(user))
  );

  const conceptLookupSlugs = [concept.slug, ...concept.aliases.map((alias) => alias.aliasSlug)];
  const [problemBacklinks, conceptBacklinks, spoilerProblemBacklinksRaw] = await Promise.all([
    prisma.problem.findMany({
      where: {
        status: "PUBLISHED",
        listed: true,
        ...visibleProblemWhere(user),
        id: {
          in: backlinks.filter((link) => link.sourceType === "PROBLEM").map((link) => link.sourceId)
        }
      },
      select: { id: true, slug: true, title: true, difficulty: true, isExercise: true }
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
        ...visibleProblemWhere(user),
        spoilerTags: {
          some: {
            tag: {
              slug: { in: conceptLookupSlugs }
            }
          }
        }
      },
      select: { id: true, slug: true, title: true, isExercise: true },
      orderBy: { updatedAt: "desc" },
      take: 30
    })
  ]);
  const problemBacklinkIds = new Set(problemBacklinks.map((problem) => problem.id));
  const regularProblemBacklinks = problemBacklinks.filter((problem) => !problem.isExercise);
  const spoilerProblemBacklinks = spoilerProblemBacklinksRaw.filter(
    (problem) => !problem.isExercise && !problemBacklinkIds.has(problem.id)
  );

  return (
    <ForestPageLayout
      className="concept-detail-page"
      title={<AsyncMarkdownInline markdown={concept.title} />}
      eyebrow={t.conceptDetail.concept}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={
        <>
          {conceptKindLabel} / {conceptDomainLabel} /{" "}
          <span className={`concept-status-badge concept-status-${concept.status.toLowerCase()}`}>
            {conceptStatusLabel}
          </span>
          {concept.needsReviewAfterEdit && (
            <span className="concept-status-badge concept-status-edited">
              {t.conceptDetail.editedSinceReview}
            </span>
          )}
          {concept.lastEditedBy && (
            <>
              {" / "}
              <span className="user-name-with-avatar">
                <UserAvatar user={concept.lastEditedBy} size="xs" />
                <span>{t.conceptDetail.editedBy(displayNameForUser(concept.lastEditedBy))}</span>
              </span>
            </>
          )}
        </>
      }
      meta={
        <>
          <p>{t.conceptDetail.talkPosts(concept._count.talkPosts)}</p>
        </>
      }
      titleBelowHero
      workspaceClassName="concept-detail-workspace"
    >
    <div className="concept-detail-layout">
      <article className="concept-detail-article">
        {hasReadingHeader && (
          <div className="reading-header mb-5">
            {isLanguageFallback && (
              <p className="quality-banner quality-unreviewed mb-4 text-sm">
                {t.translations.fallbackNotice(contentLanguageLabel(concept.language), contentLanguageLabel(targetViewLanguage))}
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
              <div className="quality-banner quality-needs-work translation-stale-banner mb-4 text-sm">
                <span>{t.translations.staleNotice(translationFreshness.basedOnRevisionId)}</span>
                {canManageTranslationFreshness && (
                  <>
                    <Link href={translationFreshness.sourceHref as never} className="underline">
                      {t.translations.compareWith(translationFreshness.sourceTitle)}
                    </Link>
                    <form action={dismissConceptTranslationStaleNoticeAction.bind(null, concept.id)}>
                      <button type="submit" className="secondary translation-stale-dismiss">
                        {t.translations.dismiss}
                      </button>
                    </form>
                  </>
                )}
              </div>
            )}
            {concept.aliases.length > 0 && (
              <p className="muted mt-1 text-sm">{t.conceptDetail.alsoKnownAs} {concept.aliases.map((alias) => alias.alias).join(", ")}</p>
            )}
          </div>
        )}

        <div className="concept-translation-row">
          <ContentTranslations
            currentLanguage={concept.language}
            hrefPrefix="/concepts"
            translations={translations}
            addTranslationLabel={t.translations.addTranslation}
            createHref={addTranslationHref}
          />
          {concept.status === "STUB" && (
            <span className="tab-nav-notice tab-nav-notice-stub">
              {t.conceptDetail.stubNotice}
            </span>
          )}
        </div>

        {concept.status === "CONTROVERSIAL" && (
          <p className="quality-banner quality-controversial mb-4">
            {t.conceptDetail.controversialNotice}
          </p>
        )}

        {concept.needsReviewAfterEdit && (
          <div className="quality-banner quality-needs-work mb-4">
            <strong>{t.conceptDetail.editedSinceReview}.</strong>{" "}
            {t.conceptDetail.editedSinceReviewNotice}
            {user && canReviewConcept(user, concept) ? (
              <form action={markConceptReviewedAction.bind(null, concept.id)} className="mt-2">
                <button type="submit" className="secondary">
                  {t.conceptDetail.confirmReview}
                </button>
              </form>
            ) : user && concept.createdById === user.id ? (
              <p className="concept-review-requirement mt-2">{t.conceptDetail.reviewRequiresAnotherUser}</p>
            ) : null}
          </div>
        )}

        {(concept.status === "STUB" || concept.status === "MISSING") && (
          <div className="quality-banner quality-stub mb-4">
            <strong>{t.concepts.statuses[concept.status]}.</strong>{" "}
            {t.conceptDetail.stubStatusNotice}
            {user && canChangeConceptStatus(user, concept, ConceptStatus.USABLE) && (
              <form action={markConceptUsableAction.bind(null, concept.id)} className="mt-2">
                <button type="submit" className="secondary">
                  {t.conceptDetail.markUsable}
                </button>
              </form>
            )}
            {user && concept.createdById === user.id && (
              <p className="concept-review-requirement mt-2">{t.conceptDetail.usableRequiresAnotherUser}</p>
            )}
          </div>
        )}

        {concept.status === "USABLE" && (
          <div className="quality-banner quality-usable mb-4">
            <strong>{t.concepts.statuses.USABLE}.</strong>{" "}
            {t.conceptDetail.usableNotice}
            {user && canReviewConcept(user, concept) ? (
              <form action={markConceptReviewedAction.bind(null, concept.id)} className="mt-2">
                <button type="submit" className="secondary">
                  {t.conceptDetail.markReviewed}
                </button>
              </form>
            ) : user && concept.createdById === user.id ? (
              <p className="concept-review-requirement mt-2">{t.conceptDetail.reviewRequiresAnotherUser}</p>
            ) : null}
          </div>
        )}

        {downgradeTargets.length > 0 && (
          <details className="concept-status-controls mb-4">
            <summary>{t.conceptDetail.changeStatus}</summary>
            <form action={downgradeConceptStatusAction.bind(null, concept.id)}>
              <p>{t.conceptDetail.changeStatusHelp}</p>
              <label>
                <span>{t.conceptDetail.status}</span>
                <select name="status" defaultValue={downgradeTargets[0]} required>
                  {downgradeTargets.map((status) => (
                    <option key={status} value={status}>
                      {t.concepts.statuses[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.conceptDetail.statusChangeReason}</span>
                <textarea
                  name="reason"
                  maxLength={240}
                  placeholder={t.conceptDetail.statusChangeReasonPlaceholder}
                  required
                />
              </label>
              <ConfirmSubmitButton className="secondary" message={t.conceptDetail.confirmStatusChange}>
                {t.conceptDetail.applyStatusChange}
              </ConfirmSubmitButton>
            </form>
          </details>
        )}

        <section className="reading-surface concept-reading-surface">
          <MarkdownBlock html={conceptBodyHtml} />
        </section>

        {practiceExercises.length > 0 && (
          <ConceptPracticeQueue
            exercises={practiceExercises.map((exercise) => ({
              id: exercise.id,
              slug: exercise.slug,
              titleHtml: exercise.titleHtml,
              difficulty: exercise.difficulty,
              difficultyTone: exercise.difficultyTone,
              solved: exercise.solved,
              solvedCountLabel: exercise.solvedCountLabel,
              blurbHtml: exercise.blurbHtml
            }))}
            labels={{
              title: t.conceptDetail.practiceWithExercises,
              previous: t.conceptDetail.previousExercise,
              next: t.conceptDetail.nextExercise,
              open: t.conceptDetail.openExercise,
              solved: t.problemDetail.solved,
              difficultyUnset: t.common.difficultyUnset,
              difficulty: t.problems.difficulty
            }}
          />
        )}

        <div className="concept-problem-boxes">
          <details className="concept-problem-box">
            <summary>
              <span>{t.conceptDetail.problemsUsingConcept(regularProblemBacklinks.length)}</span>
            </summary>
            <div className="concept-problem-list">
              {regularProblemBacklinks.map((problem) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`} className="concept-problem-link">
                  <AsyncMarkdownInline markdown={problem.title} />
                </Link>
              ))}
              {regularProblemBacklinks.length === 0 && <p>{t.conceptDetail.noProblemsUsingConcept}</p>}
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

      <aside className="concept-detail-rail">
        <nav className="problem-rail-actions concept-rail-actions" aria-label={t.conceptDetail.concept}>
          <Link href={`/concepts/${concept.slug}/edit`}>
            <span className="problem-rail-action-label"><Pencil size={16} aria-hidden="true" /><span>{t.conceptDetail.edit}</span></span>
          </Link>
          <Link href={`/concepts/${concept.slug}/talk`}>
            <span className="problem-rail-action-label"><MessageCircle size={16} aria-hidden="true" /><span>{t.conceptDetail.talk}</span></span>
            <span className="problem-rail-action-count">{concept._count.talkPosts}</span>
          </Link>
          <Link href={`/concepts/${concept.slug}/history`}>
            <span className="problem-rail-action-label"><History size={16} aria-hidden="true" /><span>{t.conceptDetail.history}</span></span>
          </Link>
          <Link href={`/concepts/${concept.slug}/export`}>
            <span className="problem-rail-action-label"><FileDown size={16} aria-hidden="true" /><span>{t.conceptDetail.exportMarkdown}</span></span>
          </Link>
        </nav>
        <section className="concept-report-surface">
          <details className="text-sm">
            <summary className="cursor-pointer font-medium"><Flag size={15} aria-hidden="true" />{t.conceptDetail.report}</summary>
            <form action={reportConceptAction.bind(null, concept.id)} className="mt-3 grid gap-2">
              <textarea name="reason" placeholder={t.conceptDetail.reportPlaceholder} required />
              <button type="submit" className="secondary">
                {t.conceptDetail.submit}
              </button>
            </form>
          </details>
        </section>

        {problemBacklinks.length + conceptBacklinks.length > 0 && (
        <section className="concept-rail-section">
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
        <section className="concept-rail-section">
          <h2 className="mb-3 font-semibold">{t.conceptDetail.outgoingLinks}</h2>
          <div className="grid gap-2 text-sm">
            {uniqueOutgoingLinks.map((link) => {
              const title = outgoingConceptTitleBySlug.get(link.targetSlug) ?? titleFromConceptSlug(link.targetSlug);

              return (
                <Link
                  key={link.id}
                  href={(link.exists ? (outgoingConceptHrefBySlug.get(link.targetSlug) ?? `/concepts/${link.targetSlug}`) : missingConceptHref(title)) as never}
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
