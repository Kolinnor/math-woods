import { ArrowLeft, MessageCircle, MessageSquarePlus, Pencil, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AsyncMarkdownInline } from "@/components/AsyncMarkdownInline";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { SignInLink } from "@/components/SignInLink";
import { UserName } from "@/components/UserName";
import { ConfirmSubmitButton } from "@/app/settings/ConfirmSubmitButton";
import {
  createConceptTalkPostAction,
  deleteConceptTalkPostAction,
  updateConceptTalkPostAction
} from "@/lib/actions/concept-community-actions";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getInterfaceLocale, getTranslations } from "@/lib/i18n/server";
import { canEditConceptTalkPost } from "@/lib/permissions";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

const talkCopy = {
  en: {
    add: "Add to the discussion",
    back: "Back to concept",
    confirmDelete: "Delete this message? This cannot be undone.",
    delete: "Delete",
    discussion: "Discussion",
    edit: "Edit",
    edited: "Edited",
    join: "to join the discussion.",
    messages: (count: number) => `${count} ${count === 1 ? "message" : "messages"}`,
    noMessages: "No messages yet.",
    post: "Post",
    save: "Save"
  },
  fr: {
    add: "Ajouter à la discussion",
    back: "Retour au concept",
    confirmDelete: "Supprimer ce message ? Cette action est irréversible.",
    delete: "Supprimer",
    discussion: "Discussion",
    edit: "Modifier",
    edited: "Modifié",
    join: "pour participer a la discussion.",
    messages: (count: number) => `${count} message${count === 1 ? "" : "s"}`,
    noMessages: "Aucun message pour l'instant.",
    post: "Publier",
    save: "Enregistrer"
  }
} as const;

export default async function ConceptTalkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, interfaceLocale, user, timeZone] = await Promise.all([
    getTranslations(),
    getInterfaceLocale(),
    getCurrentUser(),
    getRequestTimeZone()
  ]);
  const copy = talkCopy[interfaceLocale];
  const concept = await prisma.concept.findUnique({
    where: { slug },
    include: {
      talkPosts: {
        where: { deletedAt: null },
        include: { author: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!concept) {
    const merged = await prisma.conceptRedirect.findUnique({
      where: { sourceSlug: slug },
      include: { targetConcept: true }
    });
    if (merged) redirect(`/concepts/${merged.targetConcept.slug}/talk`);
    notFound();
  }
  const ownTalkPostResetSignal = user ? concept.talkPosts.filter((post) => post.authorId === user.id).at(-1)?.id ?? 0 : 0;
  const dateFormatter = new Intl.DateTimeFormat(interfaceLocale === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timeZone ?? undefined
  });

  return (
    <ForestPageLayout
      className="discussion-page discussion-page-concept"
      title={<AsyncMarkdownInline markdown={concept.title} />}
      eyebrow={copy.discussion}
      heroImage="/art/birch-grove.jpg"
      heroAlt="Ivan Shishkin, Birch Grove"
      description={copy.messages(concept.talkPosts.length)}
      titleBelowHero
      workspaceClassName="discussion-page-workspace"
      actions={
        <Link href={`/concepts/${concept.slug}`} className="button secondary discussion-back-link">
          <ArrowLeft size={17} aria-hidden="true" />
          {copy.back}
        </Link>
      }
    >
      {!user && (
        <p className="discussion-sign-in">
          <SignInLink>{t.nav.signIn}</SignInLink> {copy.join}
        </p>
      )}

      <section className="discussion-thread" aria-label={copy.discussion}>
        {concept.talkPosts.map((post) => {
          const canManagePost = Boolean(user && canEditConceptTalkPost(user, post));

          return (
            <article key={post.id} className="discussion-post">
              <header className="discussion-post-header">
                <div className="discussion-post-author">
                  <Link href={`/profile/${post.author.profileSlug}`}>
                    <UserName user={post.author} />
                  </Link>
                  <time dateTime={post.createdAt.toISOString()}>{dateFormatter.format(post.createdAt)}</time>
                  {post.editedAt && <span className="muted">{" · "}{copy.edited}</span>}
                </div>
              </header>
              <div className="discussion-post-body">
                <MarkdownBlock html={post.bodyHtml} />
              </div>
              {canManagePost && (
                <footer className="discussion-post-footer">
                  <details>
                    <summary>
                      <Pencil size={14} aria-hidden="true" />
                      {copy.edit}
                    </summary>
                    <form action={updateConceptTalkPostAction.bind(null, post.id, concept.slug)} className="discussion-inline-form">
                      <LazyMarkdownEditor
                        name="bodyMarkdown"
                        initialValue={post.bodyMarkdown}
                        minHeight="7rem"
                        lineNumbers={false}
                      />
                      <button type="submit" className="secondary">
                        {copy.save}
                      </button>
                    </form>
                  </details>
                  <form action={deleteConceptTalkPostAction.bind(null, post.id, concept.slug)}>
                    <ConfirmSubmitButton className="discussion-text-action discussion-delete-action" message={copy.confirmDelete}>
                      <Trash2 size={14} aria-hidden="true" />
                      {copy.delete}
                    </ConfirmSubmitButton>
                  </form>
                </footer>
              )}
            </article>
          );
        })}

        {concept.talkPosts.length === 0 && (
          <div className="discussion-empty-state">
            <MessageCircle size={25} aria-hidden="true" />
            <p>{copy.noMessages}</p>
          </div>
        )}
      </section>

      {user && (
        <form action={createConceptTalkPostAction.bind(null, concept.id, concept.slug)} className="discussion-composer">
          <h2>
            <MessageSquarePlus size={19} aria-hidden="true" />
            {copy.add}
          </h2>
          <LazyMarkdownEditor
            name="bodyMarkdown"
            minHeight="9rem"
            lineNumbers={false}
            draftKey={`concept-talk:${concept.id}:reply`}
            resetSignal={ownTalkPostResetSignal}
          />
          <div className="discussion-composer-actions">
            <button type="submit">
              <Send size={16} aria-hidden="true" />
              {copy.post}
            </button>
          </div>
        </form>
      )}
    </ForestPageLayout>
  );
}
