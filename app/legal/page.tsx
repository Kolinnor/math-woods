import type { Metadata } from "next";
import Link from "next/link";
import { ForestPageLayout } from "@/components/ForestPageLayout";

export const metadata: Metadata = {
  title: "Legal & brand | Math Woods",
  description: "Licenses, terms of use, privacy, and brand rules for Math Woods."
};

const repositoryUrl = "https://github.com/Kolinnor/math-woods";

export default function LegalPage() {
  return (
    <ForestPageLayout
      title="Legal & brand"
      description="Licenses, community terms, privacy, and the rules that protect the Math Woods identity."
      heroImage="/art/oak-grove.jpg"
      heroAlt="Ivan Shishkin, Oak Grove"
    >
      <div className="legal-page">
        <nav className="legal-jump-links" aria-label="Legal page sections">
          <a href="#software">Software</a>
          <a href="#content">Educational content</a>
          <a href="#brand">Brand</a>
          <a href="#terms">Terms</a>
          <a href="#privacy">Privacy</a>
        </nav>

        <section className="legal-summary" aria-label="License overview">
          <div>
            <span>Software code</span>
            <strong>AGPL-3.0-or-later</strong>
            <a href={`${repositoryUrl}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">
              Read the license
            </a>
          </div>
          <div>
            <span>Educational content</span>
            <strong>CC BY-NC-SA 4.0</strong>
            <a
              href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Read the license
            </a>
          </div>
          <div>
            <span>Official identity</span>
            <strong>Protected brand assets</strong>
            <a href="#brand">Read the brand policy</a>
          </div>
        </section>

        <section className="legal-section" id="software">
          <p className="legal-section-label">Software</p>
          <h2>Open source under the GNU AGPL</h2>
          <p>
            The Math Woods application code is licensed under the GNU Affero General Public License,
            version 3 or any later version. You may study, run, modify, and redistribute the code under
            that license. Operators of modified network versions must offer their corresponding source
            code to their users.
          </p>
          <p>
            The source code for the official service is available in the{" "}
            <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">
              public GitHub repository
            </a>
            . The software is provided without warranty, as described by the AGPL.
          </p>
        </section>

        <section className="legal-section" id="content">
          <p className="legal-section-label">Educational content</p>
          <h2>A separate license for mathematical material</h2>
          <p>
            Unless a page states otherwise, public educational content on Math Woods is licensed under
            CC BY-NC-SA 4.0. This includes problem statements, solutions, explanations, concept pages,
            explorations, and other public learning resources.
          </p>
          <p>
            Reuse requires attribution, a link to the license, an indication of changes, non-commercial
            use, and the same license for adaptations. Third-party material and public-domain works keep
            their own notices.
          </p>
          <a
            href={`${repositoryUrl}/blob/main/CONTENT_LICENSE.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the complete content policy
          </a>
        </section>

        <section className="legal-section" id="brand">
          <p className="legal-section-label">Brand policy</p>
          <h2>Open code does not make the official identity open</h2>
          <p>
            The Math Woods name, logo, domain, visual identity, and related brand assets are not licensed
            under the AGPL or CC BY-NC-SA. Forks and modified public versions must use a clearly different
            name and branding and must not imply endorsement by the official project.
          </p>
          <p>
            Accurate references such as “forked from Math Woods” are permitted when they are truthful,
            limited, and do not create confusion about who operates the service.
          </p>
          <a href={`${repositoryUrl}/blob/main/TRADEMARK.md`} target="_blank" rel="noopener noreferrer">
            Read the repository brand policy
          </a>
        </section>

        <section className="legal-section" id="terms">
          <p className="legal-section-label">Terms of use</p>
          <h2>Contribute lawfully and treat the community with care</h2>
          <p>
            By creating an account or submitting content, you agree to provide only material you have the
            right to publish, to use the service lawfully, and not to disrupt, abuse, or mislead the
            community. You are responsible for keeping your account access secure.
          </p>
          <p>
            Math Woods may review, edit, hide, archive, or remove content and may restrict accounts when
            reasonably necessary to protect the project, its users, or third-party rights. The service is
            provided as is, without guaranteed availability, and mathematical material is not professional
            advice.
          </p>
          <p>
            The official site is intended to remain free to use, without subscriptions or advertising.
            This project commitment does not change the separate permissions and obligations of the
            software and content licenses.
          </p>
        </section>

        <section className="legal-section" id="privacy">
          <p className="legal-section-label">Privacy</p>
          <h2>Use the data needed to operate the service, not to sell attention</h2>
          <p>
            Math Woods processes account details, authentication and security data, progress, preferences,
            contributions, and social activity to operate the site. Public profiles and contributions are
            public; passwords, private messages, and private account data are not published.
          </p>
          <p>
            Essential cookies and local storage keep sessions and preferences working. Math Woods does not
            sell personal data or use advertising trackers. External sign-in providers receive an OAuth
            request only when you choose to use them, and infrastructure providers process data as needed
            to host and secure the service.
          </p>
          <p>
            Account deletion is available in Settings. Some public contribution records may be retained
            or anonymized where necessary to preserve revision history, prevent abuse, or meet legal
            obligations.
          </p>
        </section>

        <section className="legal-contact">
          <div>
            <p className="legal-section-label">Questions</p>
            <h2>Something unclear?</h2>
          </div>
          <div className="legal-contact-links">
            <Link href="/suggestions">Contact the project</Link>
            <a href={`${repositoryUrl}/issues`} target="_blank" rel="noopener noreferrer">
              Report a source-code issue
            </a>
          </div>
        </section>
      </div>
    </ForestPageLayout>
  );
}
