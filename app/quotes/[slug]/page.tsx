import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { prisma } from "@/lib/db";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const quote = await prisma.quote.findUnique({
    where: { slug },
    include: {
      contributor: true,
      relatedProblems: {
        include: {
          problem: {
            include: {
              tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }
            }
          }
        },
        orderBy: { problem: { title: "asc" } }
      },
      relatedConcepts: {
        include: {
          concept: {
            include: { aliases: { orderBy: { alias: "asc" } } }
          }
        },
        orderBy: { concept: { title: "asc" } }
      }
    }
  });

  if (!quote) notFound();

  return (
    <ForestPageLayout
      title={quote.attributedTo ?? "Unattributed"}
      eyebrow="Quote"
      heroImage="/art/pine-forest.jpg"
      heroAlt="Ivan Shishkin, Pine Forest"
      description={`added by ${quote.contributor ? displayNameForUser(quote.contributor) : "former user"} on ${quote.createdAt.toLocaleDateString("en-US")}`}
      meta={
        <>
          <p>{quote.relatedProblems.length} related problems</p>
          <p>{quote.relatedConcepts.length} related concepts</p>
        </>
      }
    >
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <section className="quote-reading">
          <blockquote>“{quote.text}”</blockquote>
          {quote.attributedTo && <p>— {quote.attributedTo}</p>}
        </section>

        {quote.noteHtml && (
          <section className="mt-6 reading-surface">
            <h2 className="mb-3 text-lg font-semibold">Note</h2>
            <MarkdownBlock html={quote.noteHtml} />
          </section>
        )}

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="mb-3 text-lg font-semibold">Related problems</h2>
            <div className="grid gap-3">
              {quote.relatedProblems.map(({ problem }) => (
                <Link key={problem.id} href={`/problems/${problem.slug}`} className="panel block p-4">
                  <div className="font-medium">
                    <AsyncMarkdownInline markdown={problem.title} />
                  </div>
                  <div className="muted mt-2 flex flex-wrap gap-2 text-xs">
                    {problem.tags.map(({ tag }) => (
                      <span key={tag.id} className="tag">
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
              {quote.relatedProblems.length === 0 && <p className="empty-state">No related problems yet.</p>}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold">Related concepts</h2>
            <div className="grid gap-3">
              {quote.relatedConcepts.map(({ concept }) => (
                <Link key={concept.id} href={`/concepts/${concept.slug}`} className="panel block p-4">
                  <div className="font-medium">{concept.title}</div>
                  {concept.aliases.length > 0 && (
                    <div className="muted mt-1 text-xs">{concept.aliases.map((alias) => alias.alias).join(", ")}</div>
                  )}
                </Link>
              ))}
              {quote.relatedConcepts.length === 0 && <p className="empty-state">No related concepts yet.</p>}
            </div>
          </div>
        </section>
      </article>

      <aside className="grid content-start gap-5">
        <section className="action-surface">
          <Link href="/quotes" className="button secondary">
            All quotes
          </Link>
          <details className="problem-origin text-sm" open>
            <summary>
              <span className="muted">Provenance</span>
              <span>{quote.provenance}</span>
            </summary>
            <p className="whitespace-pre-wrap pt-3">
              {quote.provenanceDetails || "No further provenance details are known yet."}
            </p>
          </details>
        </section>
      </aside>
    </div>
    </ForestPageLayout>
  );
}
