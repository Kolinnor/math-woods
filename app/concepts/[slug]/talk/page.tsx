import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { createConceptTalkPostAction } from "@/lib/actions/concept-community-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { displayNameForUser } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function ConceptTalkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: {
      talkPosts: {
        include: { author: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!concept) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="muted text-sm">Editorial discussion</p>
          <h1 className="text-2xl font-bold">{concept.title}</h1>
        </div>
        <Link href={`/concepts/${concept.slug}`} className="button secondary">
          Article
        </Link>
      </div>

      <p className="muted mb-6">
        Use this page to discuss scope, sources, ambiguity, notation, and proposed improvements. Mathematical problem
        solving belongs on problem discussions.
      </p>

      <div className="grid gap-4">
        {concept.talkPosts.map((post) => (
          <article key={post.id} className="panel p-5">
            <p className="muted mb-3 text-sm">
              <Link href={`/profile/${post.author.username}`} className="underline">
                {displayNameForUser(post.author)}
              </Link>{" "}
              · {post.createdAt.toLocaleString("en-US")}
            </p>
            <MarkdownBlock html={post.bodyHtml} />
          </article>
        ))}
        {concept.talkPosts.length === 0 && <p className="muted panel p-5">No editorial discussion yet.</p>}
      </div>

      {user ? (
        <form action={createConceptTalkPostAction.bind(null, concept.id, concept.slug)} className="panel mt-6 grid gap-3 p-5">
          <label className="grid gap-2">
            <span className="text-sm font-medium">Add to the discussion</span>
            <LazyMarkdownEditor name="bodyMarkdown" minHeight="9rem" lineNumbers={false} />
          </label>
          <button type="submit">Post</button>
        </form>
      ) : (
        <p className="muted mt-6">
          <Link href="/login" className="underline">
            Sign in
          </Link>{" "}
          to join the editorial discussion.
        </p>
      )}
    </div>
  );
}
