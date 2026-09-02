import type { Route } from "next";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import {
  acknowledgeConceptContributorGuideAction,
  updateConceptContributorGuideAction
} from "@/lib/actions/concept-contributor-guide-actions";
import { loginHrefForReturnTo } from "@/lib/auth-return";
import { getCurrentUser } from "@/lib/auth";
import {
  loadConceptContributorGuide,
  loadRenderedConceptContributorGuide
} from "@/lib/concept-contributor-guide";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import type { InterfaceLocale } from "@/lib/i18n/types";
import { safeReturnTo } from "@/lib/oauth-utils";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ConceptContributorGuidePage({
  searchParams
}: {
  searchParams?: Promise<{ required?: string; returnTo?: string; saved?: string }>;
}) {
  const [locale, user, t, params] = await Promise.all([
    getInterfaceLocale(),
    getCurrentUser(),
    getTranslations(),
    searchParams ?? Promise.resolve({} as { required?: string; returnTo?: string; saved?: string })
  ]);
  const canEditGuide = Boolean(user && canUseAdminTools(user));
  const languages: InterfaceLocale[] = ["fr", "en"];
  const [content, guides] = await Promise.all([
    loadRenderedConceptContributorGuide(locale),
    canEditGuide
      ? Promise.all(languages.map((language) => loadConceptContributorGuide(language)))
      : Promise.resolve([])
  ]);
  const returnTo = safeReturnTo(params.returnTo, "/concepts/new");
  const hasAcknowledged = Boolean(user?.conceptGuideAcknowledgedAt);

  return (
    <ForestPageLayout
      title={content.title}
      description={content.description}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      actions={
        <>
          {hasAcknowledged && (
            <Link href="/concepts/new" className="button">
              {t.conceptGuide.createConcept}
            </Link>
          )}
          <Link href="/contributing/tasks" className="button secondary">
            {t.conceptGuide.backToContributing}
          </Link>
        </>
      }
    >
      <div className="concept-guide-admin-layout">
        <article className="concept-contributor-guide">
          <MarkdownBlock html={content.bodyHtml} />
        </article>

        <section className="concept-guide-acknowledgement" aria-labelledby="concept-guide-acknowledgement-title">
          <div>
            <h2 id="concept-guide-acknowledgement-title">
              {hasAcknowledged ? t.conceptGuide.acknowledgedTitle : t.conceptGuide.acknowledgementTitle}
            </h2>
            <p>
              {hasAcknowledged
                ? t.conceptGuide.acknowledgedDescription
                : t.conceptGuide.acknowledgementDescription}
            </p>
          </div>
          {hasAcknowledged ? (
            <Link href={returnTo as never} className="button">
              {t.conceptGuide.continueToConcept}
            </Link>
          ) : user ? (
            <form action={acknowledgeConceptContributorGuideAction.bind(null, returnTo)}>
              <button type="submit">{t.conceptGuide.acknowledge}</button>
            </form>
          ) : (
            <Link
              href={loginHrefForReturnTo(
                `/contributing/guides/concepts?returnTo=${encodeURIComponent(returnTo)}`
              ) as Route}
              className="button"
            >
              {t.conceptGuide.signInToContinue}
            </Link>
          )}
        </section>

        {canEditGuide && (
          <section className="concept-guide-inline-editor" aria-labelledby="concept-guide-editor-title">
            <div className="concept-guide-inline-editor-heading">
              <h2 id="concept-guide-editor-title">{t.conceptGuide.editTitle}</h2>
              <p>{t.conceptGuide.editDescription}</p>
            </div>
            {params.saved && <p className="success-banner">{t.conceptGuide.saved}</p>}
            <div className="concept-guide-editor-grid">
              {guides.map((guide) => (
                <form
                  key={guide.language}
                  action={updateConceptContributorGuideAction.bind(null, guide.language)}
                  className="panel grid gap-4 p-5"
                >
                  <h2>{t.conceptGuide.languageName[guide.language]}</h2>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">{t.conceptGuide.titleField}</span>
                    <input name="title" defaultValue={guide.title} required maxLength={160} />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium">{t.conceptGuide.descriptionField}</span>
                    <textarea name="description" defaultValue={guide.description} required rows={3} />
                  </label>
                  <div className="grid gap-2">
                    <span className="text-sm font-medium">{t.conceptGuide.contentField}</span>
                    <MarkdownEditor
                      name="bodyMarkdown"
                      initialValue={guide.bodyMarkdown}
                      minHeight="30rem"
                      draftKey={`concept-contributor-guide:${guide.language}`}
                    />
                  </div>
                  <button type="submit">{t.conceptGuide.save}</button>
                </form>
              ))}
            </div>
          </section>
        )}
      </div>
    </ForestPageLayout>
  );
}
