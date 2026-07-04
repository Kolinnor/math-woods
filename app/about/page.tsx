import Link from "next/link";
import type { Route } from "next";
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
        <p className="about-eyebrow">Math Woods' first promise</p>
        <h1>Free forever. No ads.</h1>
      </section>

      <section className="about-principles">
        <div>
          <h2>Open by design</h2>
          <p>The code, public pages, revisions, and exports should be easy to inspect and reuse.</p>
        </div>
        <div>
          <h2>People remain responsible</h2>
          <p>Tools can help. A person still has to understand, check, source, and stand behind each contribution.</p>
        </div>
        <div>
          <h2>Respect the source</h2>
          <p>Ideas travel. Wording, attribution, and permission still matter.</p>
        </div>
      </section>

      <section className="about-credit">
        <p className="about-eyebrow">How this site was made</p>
        <h2>Built with Codex, under human direction.</h2>
        <p>
          Math Woods was coded with help from Codex, an AI coding agent by OpenAI, under human direction and review.
          The published site remains a human responsibility.
        </p>
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
    </ForestPageLayout>
  );
}
