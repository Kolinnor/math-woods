import Link from "next/link";
import type { Route } from "next";
import { AvatarArtworkCredit } from "@/components/AvatarArtworkCredit";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { getCurrentUser } from "@/lib/auth";
import { loadRenderedFaqSections } from "@/lib/faq";
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
  const [user, faqSections] = await Promise.all([getCurrentUser(), loadRenderedFaqSections()]);
  const canEditFaq = Boolean(user && canUseAdminTools(user));

  return (
    <ForestPageLayout
      title="About"
      heroImage="/art/morning-in-a-pine-forest.jpg"
      heroAlt="Ivan Shishkin, Morning in a Pine Forest"
      actions={
        canEditFaq && (
          <Link href={"/about/faq/edit" as Route} className="button secondary">
            Edit FAQ
          </Link>
        )
      }
    >
      <section className="about-promise">
        <p className="about-eyebrow">Math Woods</p>
        <h1>
          The{" "}
          <a
            href="https://github.com/Kolinnor/math-woods"
            className="about-promise-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Free
          </a>{" "}
          Math Knowledge Graph.
        </h1>
        <p>An open-source, community-curated database of mathematical problems and concepts.</p>
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
          <h2>Useful documents</h2>
          <p className="muted">Short references for editing and contributing.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/contributing" className="button secondary">
            Contribution guidelines
          </Link>
          <Link href="/suggestions" className="button secondary">
            Suggest an improvement
          </Link>
        </div>
      </section>

      <section className="about-credit" id="credits">
        <h2>Credits</h2>
        <div className="about-credit-list">
          <p>
            Forest paintings by Ivan Shishkin (1832-1898), public domain via{" "}
            <a
              href="https://commons.wikimedia.org/wiki/Category:Ivan_Shishkin"
              target="_blank"
              rel="noopener noreferrer"
            >
              Wikimedia Commons
            </a>
            .
          </p>
          <p>Logo hand drawn by Nugget.</p>
          <AvatarArtworkCredit label="Default avatar artwork" />
        </div>
      </section>
    </ForestPageLayout>
  );
}
