import Link from "next/link";
import { createSuggestionAction } from "@/lib/actions/suggestion-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isVerifiedContributor } from "@/lib/permissions";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage({
  searchParams
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const user = await getCurrentUser();
  const canContribute = Boolean(user && isVerifiedContributor(user));
  const { submitted } = await searchParams;
  const suggestions = await prisma.suggestion.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: true },
    take: 30
  });

  return (
    <div className="mx-auto grid max-w-4xl gap-7">
      <div>
        <h1 className="text-2xl font-bold">Suggestion box</h1>
        <p className="muted mt-1">Small ideas, rough edges, and useful directions for Math Woods.</p>
      </div>

      {submitted && <p className="panel border-green-700 bg-green-50 p-4 text-sm text-green-900">Suggestion sent.</p>}

      {canContribute ? (
        <form action={createSuggestionAction} className="panel grid gap-4 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Short title</span>
            <input name="title" maxLength={140} required />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">What would make the site better?</span>
            <textarea name="body" maxLength={4000} required />
          </label>
          <button type="submit">Send suggestion</button>
        </form>
      ) : user ? (
        <p className="panel p-5">
          <Link href="/settings?verify=required" className="underline">
            Verify your email
          </Link>{" "}
          before sending suggestions.
        </p>
      ) : (
        <p className="panel p-5">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to send a suggestion.
        </p>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Recent suggestions</h2>
        <div className="grid gap-3">
          {suggestions.map((suggestion) => (
            <article key={suggestion.id} className="panel p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="font-semibold">{suggestion.title}</h3>
                <span className="muted text-xs">{suggestion.status.toLowerCase()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{suggestion.body}</p>
              <p className="muted mt-3 text-xs">
                {suggestion.author ? displayNameForUser(suggestion.author) : "former user"} ·{" "}
                {suggestion.createdAt.toLocaleDateString("en-US")}
              </p>
            </article>
          ))}
          {suggestions.length === 0 && <p className="muted panel p-5">No suggestions yet.</p>}
        </div>
      </section>
    </div>
  );
}
