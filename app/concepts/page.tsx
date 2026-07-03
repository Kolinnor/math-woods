import { ConceptStatus, MathDomain, Prisma } from "@prisma/client";
import Link from "next/link";
import { ContributionRequestDialog } from "@/components/ContributionRequestDialog";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { createContributionRequestAction } from "@/lib/actions/contribution-request-actions";
import { prisma } from "@/lib/db";
import { coarseDomainForCode, domainCodeAliases, domainLabel, parseDomainCode, PROBLEM_DOMAINS } from "@/lib/domains";
import { missingConcepts } from "@/lib/internal-links";
import { contentLanguageLabel } from "@/lib/languages";
import { getPreferredContentLanguage } from "@/lib/server-language";

export const dynamic = "force-dynamic";

function conceptTitleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default async function ConceptsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; domain?: string; status?: string }>;
}) {
  const preferredLanguage = await getPreferredContentLanguage();
  const { q = "", domain = "", status = "" } = await searchParams;
  const query = q.trim();
  const domainValue = domain ? parseDomainCode(domain) : undefined;
  const domainFilterValues = domainValue
    ? [
        coarseDomainForCode(domainValue),
        ...domainCodeAliases(domainValue).filter((value): value is MathDomain =>
          Object.values(MathDomain).includes(value as MathDomain)
        )
      ]
    : [];
  const statusValue = Object.values(ConceptStatus).includes(status as ConceptStatus)
    ? (status as ConceptStatus)
    : undefined;
  const where: Prisma.ConceptWhereInput = {
    language: preferredLanguage,
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { bodyMarkdown: { contains: query, mode: "insensitive" } },
            { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }
          ]
        }
      : {}),
    ...(domainValue ? { domain: { in: [...new Set(domainFilterValues)] } } : {}),
    ...(statusValue ? { status: statusValue } : {})
  };

  const [concepts, missing] = await Promise.all([
    prisma.concept.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 75,
      include: {
        aliases: true,
        _count: { select: { references: true, talkPosts: true } }
      }
    }),
    missingConcepts(30)
  ]);

  return (
    <div className="directory-page grid gap-8 lg:grid-cols-[1fr_18rem]">
      <section>
        <div className="page-header">
          <div>
            <h1 className="text-2xl font-bold">Concepts</h1>
            <p className="muted mt-1">
              A linked, sourced, collaboratively maintained mathematics encyclopedia in {contentLanguageLabel(preferredLanguage)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/contributing" className="button secondary">
              Guidelines
            </Link>
            <Link href="/concepts/random" className="button secondary">
              Random
            </Link>
            <Link href="/recent-changes" className="button secondary">
              Recent changes
            </Link>
            <Link href="/watchlist" className="button secondary">
              Watchlist
            </Link>
            <Link href="/concepts/new" className="button">
              New
            </Link>
            <ContributionRequestDialog
              action={createContributionRequestAction.bind(null, "CONCEPT", "/concepts")}
              buttonLabel="Request a concept"
              title="Request a concept"
              description="Tell contributors which mathematical notion should get a concept page."
              placeholder="Describe the concept page you would like: the notion, examples, related results, references, or level of detail you have in mind."
            />
          </div>
        </div>

        <LiveSearchForm className="filter-bar mb-6 grid gap-3 p-4 md:grid-cols-[1fr_12rem_12rem_auto]">
          <input name="q" defaultValue={query} placeholder="Search titles, content, or aliases" />
          <select name="domain" defaultValue={domainValue ?? ""}>
            <option value="">Any domain</option>
            {PROBLEM_DOMAINS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={statusValue ?? ""}>
            <option value="">Any status</option>
            <option value="STUB">Stub</option>
            <option value="USABLE">Usable</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="EXCELLENT">Excellent</option>
            <option value="CONTROVERSIAL">Controversial</option>
          </select>
          <button type="submit">Search</button>
        </LiveSearchForm>

        <div className="list-surface">
          {concepts.map((concept) => (
            <Link key={concept.id} href={`/concepts/${concept.slug}`} className="list-row block">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{concept.title}</h2>
                  <p className="meta">
                    {domainLabel(concept.domain)} / {concept.status.toLowerCase()} / {concept._count.references}{" "}
                    sources / {concept._count.talkPosts} talk posts
                  </p>
                  {concept.aliases.length > 0 && (
                    <p className="muted mt-1 text-xs">{concept.aliases.map((alias) => alias.alias).join(", ")}</p>
                  )}
                </div>
                <span className="meta">updated {concept.updatedAt.toLocaleDateString("en-US")}</span>
              </div>
            </Link>
          ))}
          {concepts.length === 0 && <p className="empty-state">No concepts match these filters.</p>}
        </div>
      </section>

      <aside className="sidebar-section content-start">
        <h2 className="mb-3 font-semibold">Missing concepts</h2>
        <p className="muted mb-4 text-sm">Frequently linked gaps are good places to contribute.</p>
        <div className="grid gap-2">
          {missing.map((item) => {
            const title = conceptTitleFromSlug(item.slug);

            return (
            <Link key={item.slug} href={`/concepts/new?title=${encodeURIComponent(title)}`} className="flex justify-between gap-3">
              <span className="wiki-link missing">{title}</span>
              <span className="muted text-sm">{item.count}</span>
            </Link>
          );
          })}
          {missing.length === 0 && <p className="muted text-sm">No missing concepts.</p>}
        </div>
      </aside>
    </div>
  );
}
