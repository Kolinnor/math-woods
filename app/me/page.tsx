import Link from "next/link";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { updatePrivateNotesAction } from "@/lib/actions/problem-actions";
import { discussionIsUnlocked, formatUnlockDistance } from "@/lib/attempts";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { problemLinkClass } from "@/lib/problem-link";

export const dynamic = "force-dynamic";

export default async function MyWorkPage() {
  const user = await requireUser();
  const attempts = await prisma.problemAttempt.findMany({
    where: { userId: user.id },
    include: {
      problem: {
        include: {
          tags: { include: { tag: true }, orderBy: { tag: { name: "asc" } } }
        }
      }
    },
    orderBy: { updatedAt: "desc" }
  });

  const counts = attempts.reduce(
    (acc, attempt) => {
      acc[attempt.status] = (acc[attempt.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article>
        <div className="mb-6">
          <h1 className="text-2xl font-bold">My work</h1>
          <p className="muted mt-1">Attempts, notes, and discussion timers.</p>
        </div>

        <div className="grid gap-4">
          {attempts.map((attempt) => {
            const unlocked = discussionIsUnlocked(attempt.discussionUnlockAt);
            return (
              <section key={attempt.id} className="panel p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/problems/${attempt.problem.slug}`}
                      className={problemLinkClass(
                        "problem-seen text-lg font-semibold underline",
                        attempt.status === "SOLVED"
                      )}
                    >
                      {attempt.problem.title}
                    </Link>
                    <p className="muted text-sm">
                      {attempt.status.toLowerCase().replace("_", " ")} ·{" "}
                      {unlocked
                        ? "discussion unlocked"
                        : `unlocks in ${formatUnlockDistance(attempt.discussionUnlockAt)}`}
                    </p>
                  </div>
                  {attempt.problem.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {attempt.problem.tags.map(({ tag }) => (
                        <Link
                          key={tag.id}
                          href={`/problems?tag=${tag.slug}`}
                          className="rounded border border-line px-2 py-0.5 text-xs"
                        >
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <form action={updatePrivateNotesAction.bind(null, attempt.problemId)} className="grid gap-3">
                  <select name="status" defaultValue={attempt.status}>
                    <option value="STARTED">Started</option>
                    <option value="BLOCKED">Blocked</option>
                    <option value="SOLVED">Solved</option>
                    <option value="REVIEW_LATER">Review later</option>
                  </select>
                  <LazyMarkdownEditor
                    name="privateNotesMarkdown"
                    initialValue={attempt.privateNotesMarkdown ?? ""}
                    minHeight="8rem"
                    lineNumbers={false}
                  />
                  <button type="submit" className="secondary">
                    Save notes
                  </button>
                </form>
              </section>
            );
          })}
          {attempts.length === 0 && (
            <p className="muted panel p-5">No attempts yet. Start a problem.</p>
          )}
        </div>
      </article>

      <aside className="grid content-start gap-5">
        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">Status summary</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <span>Started</span>
              <span>{counts.STARTED ?? 0}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Blocked</span>
              <span>{counts.BLOCKED ?? 0}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Solved</span>
              <span>{counts.SOLVED ?? 0}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Review later</span>
              <span>{counts.REVIEW_LATER ?? 0}</span>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold">Profile</h2>
          <Link href={`/profile/${user.username}`} className="underline">
            @{user.username}
          </Link>
        </section>
      </aside>
    </div>
  );
}
