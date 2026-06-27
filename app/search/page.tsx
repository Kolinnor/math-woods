import Link from "next/link";
import { LiveSearchForm } from "@/components/LiveSearchForm";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { domainLabel } from "@/lib/domains";
import { contentLanguageLabel } from "@/lib/languages";
import { problemLinkClass } from "@/lib/problem-link";
import { getPreferredContentLanguage } from "@/lib/server-language";

export const dynamic = "force-dynamic";

async function searchQuotes(query: string, language: string) {
  try {
    return await prisma.quote.findMany({
      where: {
        language,
        OR: [
          { text: { contains: query, mode: "insensitive" } },
          { attributedTo: { contains: query, mode: "insensitive" } },
          { provenance: { contains: query, mode: "insensitive" } }
        ]
      },
      take: 20
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2021") {
      return [];
    }
    throw error;
  }
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = (await searchParams).q?.trim() ?? "";
  const user = await getCurrentUser();
  const preferredLanguage = await getPreferredContentLanguage();
  const [concepts, problems, playlists, quotes] = query
    ? await Promise.all([
        prisma.concept.findMany({
          where: {
            language: preferredLanguage,
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { bodyMarkdown: { contains: query, mode: "insensitive" } },
              { aliases: { some: { alias: { contains: query, mode: "insensitive" } } } }
            ]
          },
          include: { aliases: true },
          take: 20
        }),
        prisma.problem.findMany({
          where: {
            status: "PUBLISHED",
            listed: true,
            language: preferredLanguage,
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { bodyMarkdown: { contains: query, mode: "insensitive" } },
              { origin: { contains: query, mode: "insensitive" } }
            ]
          },
          take: 20
        }),
        prisma.playlist.findMany({
          where: {
            visibility: "PUBLIC",
            language: preferredLanguage,
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { descriptionMarkdown: { contains: query, mode: "insensitive" } }
            ]
          },
          take: 20
        }),
        searchQuotes(query, preferredLanguage)
      ])
    : [[], [], [], []];
  const solvedAttempts = user
    ? await prisma.problemAttempt.findMany({
        where: { userId: user.id, status: "SOLVED", problemId: { in: problems.map((problem) => problem.id) } },
        select: { problemId: true }
      })
    : [];
  const solvedIds = new Set(solvedAttempts.map((attempt) => attempt.problemId));

  const total = concepts.length + problems.length + playlists.length + quotes.length;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Search</h1>
        <LiveSearchForm className="mt-4 flex gap-2">
          <input name="q" defaultValue={query} placeholder="Search Math Woods" autoFocus />
          <button type="submit">Search</button>
        </LiveSearchForm>
        {query && (
          <p className="muted mt-3 text-sm" role="status" aria-live="polite">
            {total} {contentLanguageLabel(preferredLanguage).toLowerCase()} results for "{query}"
          </p>
        )}
      </div>

      <div className="grid gap-7 lg:grid-cols-4">
        <section>
          <h2 className="mb-3 font-semibold">Concepts</h2>
          <div className="grid gap-3">
            {concepts.map((concept) => (
              <Link key={concept.id} href={`/concepts/${concept.slug}`} className="panel block p-4">
                <div className="font-medium">{concept.title}</div>
                <div className="muted mt-1 text-xs">
                  {domainLabel(concept.domain)} / {concept.status.toLowerCase()}
                </div>
                {concept.aliases.length > 0 && (
                  <div className="muted mt-1 text-xs">{concept.aliases.map((alias) => alias.alias).join(", ")}</div>
                )}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Problems</h2>
          <div className="grid gap-3">
            {problems.map((problem) => (
              <Link
                key={problem.id}
                href={`/problems/${problem.slug}`}
                className={problemLinkClass("panel block p-4", solvedIds.has(problem.id))}
              >
                <div className="font-medium">{problem.title}</div>
                <div className="muted mt-1 text-xs">{domainLabel(problem.domain)}</div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Playlists</h2>
          <div className="grid gap-3">
            {playlists.map((playlist) => (
              <Link key={playlist.id} href={`/playlists/${playlist.slug}`} className="panel block p-4">
                <div className="font-medium">{playlist.title}</div>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-semibold">Quotes</h2>
          <div className="grid gap-3">
            {quotes.map((quote) => (
              <Link key={quote.id} href={`/quotes/${quote.slug}`} className="panel block p-4">
                <div className="font-medium">"{quote.text}"</div>
                <div className="muted mt-1 text-xs">{quote.attributedTo ?? quote.provenance}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {query && total === 0 && (
        <p className="muted panel mt-6 p-5">
          No results. Try another term, or create a missing concept from the Concepts page.
        </p>
      )}
    </div>
  );
}
