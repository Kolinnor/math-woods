import type { Metadata } from "next";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t.legalPage.title} | Math Woods`, description: t.legalPage.description };
}

const repositoryUrl = "https://github.com/Kolinnor/math-woods";

export default async function LegalPage() {
  const t = await getTranslations();
  return (
    <ForestPageLayout
      title={t.legalPage.title}
      description={t.legalPage.description}
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
    >
      <div className="legal-page">
        <nav className="legal-jump-links" aria-label={t.legalPage.sectionsAria}>
          <a href="#software">{t.legalPage.software}</a>
          <a href="#content">{t.legalPage.content}</a>
          <a href="#brand">{t.legalPage.brand}</a>
          <a href="#terms">{t.legalPage.terms}</a>
          <a href="#privacy">{t.legalPage.privacy}</a>
        </nav>

        <section className="legal-summary" aria-label={t.legalPage.overviewAria}>
          <div>
            <span>{t.legalPage.code}</span>
            <strong>AGPL-3.0-or-later</strong>
            <a href={`${repositoryUrl}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
              {t.legalPage.readLicense}
            </a>
          </div>
          <div>
            <span>{t.legalPage.content}</span>
            <strong>CC BY-NC-SA 4.0</strong>
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.legalPage.readLicense}
            </a>
          </div>
          <div>
            <span>{t.legalPage.officialIdentity}</span>
            <strong>{t.legalPage.protectedAssets}</strong>
            <a href="#brand">{t.legalPage.readBrandPolicy}</a>
          </div>
        </section>

        <section className="legal-section" id="software">
          <p className="legal-section-label">{t.legalPage.software}</p>
          <h2>{t.legalPage.softwareTitle}</h2>
          <p>{t.legalPage.softwareBody1}</p>
          <p>
            {t.legalPage.softwareBody2BeforeLink}{" "}
            <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">
              {t.legalPage.publicRepository}
            </a>
            {t.legalPage.softwareBody2AfterLink}
          </p>
        </section>

        <section className="legal-section" id="content">
          <p className="legal-section-label">{t.legalPage.content}</p>
          <h2>{t.legalPage.contentTitle}</h2>
          <p>{t.legalPage.contentBody1}</p>
          <p>{t.legalPage.contentBody2}</p>
          <a
            href={`${repositoryUrl}/blob/main/CONTENT_LICENSE.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.legalPage.readContentPolicy}
          </a>
        </section>

        <section className="legal-section" id="brand">
          <p className="legal-section-label">{t.legalPage.brandPolicy}</p>
          <h2>{t.legalPage.brandTitle}</h2>
          <p>{t.legalPage.brandBody1}</p>
          <p>{t.legalPage.brandBody2}</p>
          <a href={`${repositoryUrl}/blob/main/TRADEMARK.md`} target="_blank" rel="noopener noreferrer">
            {t.legalPage.repositoryBrandPolicy}
          </a>
        </section>

        <section className="legal-section" id="terms">
          <p className="legal-section-label">{t.legalPage.termsOfUse}</p>
          <h2>{t.legalPage.termsTitle}</h2>
          <p>{t.legalPage.termsBody1}</p>
          <p>{t.legalPage.termsBody2}</p>
          <p>{t.legalPage.termsBody3}</p>
        </section>

        <section className="legal-section" id="privacy">
          <p className="legal-section-label">{t.legalPage.privacy}</p>
          <h2>{t.legalPage.privacyTitle}</h2>
          <p>{t.legalPage.privacyBody1}</p>
          <p>{t.legalPage.privacyBody2}</p>
          <p>{t.legalPage.privacyBody3}</p>
        </section>

        <section className="legal-contact">
          <div>
            <p className="legal-section-label">{t.legalPage.questions}</p>
            <h2>{t.legalPage.unclear}</h2>
          </div>
          <div className="legal-contact-links">
            <a href={`${repositoryUrl}/issues`} target="_blank" rel="noopener noreferrer">
              {t.legalPage.reportCodeIssue}
            </a>
          </div>
        </section>
      </div>
    </ForestPageLayout>
  );
}
