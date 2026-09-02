import Link from "next/link";
import type { Route } from "next";
import { AvatarArtworkCredit } from "@/components/AvatarArtworkCredit";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { getCurrentUser } from "@/lib/auth";
import { loadRenderedFaqSections } from "@/lib/faq";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function Faq({ question, answerHtml }: { question: string; answerHtml: string }) {
  return (
    <details className="faq-item">
      <summary>{question}</summary>
      <div className="faq-answer">
        <MarkdownBlock html={answerHtml} />
      </div>
    </details>
  );
}

export default async function AboutPage() {
  const [user, locale, t] = await Promise.all([getCurrentUser(), getInterfaceLocale(), getTranslations()]);
  const faqSections = await loadRenderedFaqSections(locale);
  const canEditFaq = Boolean(user && canUseAdminTools(user));

  return (
    <ForestPageLayout
      title={t.about.title}
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      actions={
        canEditFaq && (
          <Link href={"/about/faq/edit" as Route} className="button secondary">
            {t.about.editFaq}
          </Link>
        )
      }
    >
      <section className="about-promise">
        <p className="about-eyebrow">{t.about.promiseEyebrow}</p>
        <h1>
          {t.about.promiseTitleBeforeLink}{" "}
          <a
            href="https://github.com/Kolinnor/math-woods"
            className="about-promise-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.about.promiseLink}
          </a>{" "}
          {t.about.promiseTitleAfterLink}
        </h1>
        <p>{t.about.promiseDescription}</p>
      </section>

      {faqSections.map((section) => (
        <section key={section.id ?? `${section.position}-${section.title}`} className="about-section" id={section.anchorId || undefined}>
          <h2>{section.title}</h2>
          {section.items.map((item) => (
            <Faq key={item.id ?? `${item.position}-${item.question}`} question={item.question} answerHtml={item.answerHtml} />
          ))}
        </section>
      ))}

      <section className="about-links">
        <div>
          <h2>{t.about.usefulDocuments}</h2>
          <p className="muted">{t.about.usefulDocumentsDescription}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/contributing" className="button secondary">
            {t.about.contributionGuidelines}
          </Link>
          <Link href={"/contributing/guides/concepts" as Route} className="button secondary">
            {t.about.conceptContributorGuide}
          </Link>
        </div>
      </section>

      <section className="about-credit" id="credits">
        <h2>{t.about.credits}</h2>
        <div className="about-credit-list">
          <p>
            {t.about.forestCreditBeforeLink}{" "}
            <a
              href="https://commons.wikimedia.org/wiki/Category:Ivan_Shishkin"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.about.forestCreditLink}
            </a>
            .
          </p>
          <p>{t.about.logoCredit}</p>
          <AvatarArtworkCredit label={t.about.avatarCredit} />
        </div>
      </section>
    </ForestPageLayout>
  );
}
