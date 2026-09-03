import { MessageCircle, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { AnnouncementLikeButton } from "@/components/AnnouncementLikeButton";
import { AnnouncementSeenMarker } from "@/components/AnnouncementSeenMarker";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { DeleteAnnouncementButton } from "@/components/DeleteAnnouncementButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { LazyMarkdownEditor } from "@/components/markdown/LazyMarkdownEditor";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import {
  createAnnouncementAction,
  createAnnouncementCommentAction,
  deleteAnnouncementCommentAction
} from "@/lib/actions/announcement-actions";
import { announcementUnreadSince } from "@/lib/announcements";
import { requireVerifiedUser } from "@/lib/auth";
import { formatUserDateTime } from "@/lib/date-format";
import { prisma } from "@/lib/db";
import { getTranslations } from "@/lib/i18n/server";
import { canUseAdminTools } from "@/lib/permissions";
import { getRequestTimeZone } from "@/lib/server-time-zone";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage({
  searchParams
}: {
  searchParams: Promise<{ announcementPosted?: string }>;
}) {
  const user = await requireVerifiedUser();
  const [t, timeZone, { announcementPosted }] = await Promise.all([
    getTranslations(),
    getRequestTimeZone(),
    searchParams
  ]);
  const labels = t.announcementsPage;
  const canManageAnnouncements = canUseAdminTools(user);
  const unreadSince = announcementUnreadSince(user);

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: { id: true, username: true, displayName: true, avatarUrl: true, avatarBackground: true }
      },
      likes: { where: { userId: user.id }, select: { userId: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              avatarBackground: true,
              profileSlug: true
            }
          }
        }
      },
      _count: { select: { likes: true } }
    }
  });

  return (
    <ForestPageLayout
      title={labels.title}
      eyebrow={labels.eyebrow}
      description={labels.description}
      sidebar={
        canManageAnnouncements ? (
          <>
            <h2 className="mb-3 font-semibold">{labels.addAnnouncement}</h2>
            {announcementPosted && (
              <p className="panel mb-3 p-3" role="status">{labels.posted}</p>
            )}
            <form action={createAnnouncementAction} className="panel grid gap-4 p-4">
              <label className="grid gap-1.5 font-medium">
                {labels.titleLabel}
                <input name="title" required maxLength={160} />
              </label>
              <label className="grid gap-1.5 font-medium">
                {labels.messageLabel}
                <textarea name="bodyMarkdown" required maxLength={4000} rows={6} />
              </label>
              <button type="submit" className="justify-self-start">{labels.addAnnouncement}</button>
            </form>
          </>
        ) : undefined
      }
    >
      <AnnouncementSeenMarker />
      <div className="grid gap-3">
        {announcements.map((announcement) => {
          const isNew = announcement.createdAt > unreadSince;
          return (
            <article
              key={announcement.id}
              className={`panel p-4${isNew ? " announcement-card-new" : ""}`}
            >
              <div className="announcement-card-header">
                <h2 className="font-semibold">{announcement.title}</h2>
                {canManageAnnouncements && (
                  <DeleteAnnouncementButton
                    announcementId={announcement.id}
                    labels={{
                      delete: labels.deleteAnnouncement,
                      confirmMessage: labels.confirmDelete,
                      yes: labels.yes,
                      no: labels.no
                    }}
                  />
                )}
              </div>
              <p className="muted text-sm">
                {announcement.createdBy && <UserName user={announcement.createdBy} />}
                {" · "}
                {formatUserDateTime(announcement.createdAt, timeZone)}
              </p>
              <div className="mt-2">
                <MarkdownBlock html={announcement.bodyHtml} />
              </div>
              <div className="announcement-card-footer">
                <AnnouncementLikeButton
                  announcementId={announcement.id}
                  initialLiked={announcement.likes.length > 0}
                  initialCount={announcement._count.likes}
                  labels={{ like: labels.like, unlike: labels.unlike }}
                />
                <details className="announcement-discussion">
                  <summary>
                    <MessageCircle size={15} aria-hidden="true" />
                    {labels.discussion(announcement.comments.length)}
                  </summary>

                  <div className="discussion-thread">
                    {announcement.comments.map((comment) => {
                      const canDeleteComment = comment.authorId === user.id || canManageAnnouncements;
                      return (
                        <article key={comment.id} id={`comment-${comment.id}`} className="discussion-post">
                          <header className="discussion-post-header">
                            <div className="discussion-post-author">
                              {comment.author ? (
                                <Link href={`/profile/${comment.author.profileSlug}`}>
                                  <UserName user={comment.author} />
                                </Link>
                              ) : null}
                              <time dateTime={comment.createdAt.toISOString()}>
                                {formatUserDateTime(comment.createdAt, timeZone)}
                              </time>
                            </div>
                            {canDeleteComment && (
                              <form action={deleteAnnouncementCommentAction.bind(null, comment.id)}>
                                <ConfirmSubmitButton
                                  className="discussion-text-action discussion-delete-action"
                                  message={labels.confirmDeleteComment}
                                  title={labels.deleteComment}
                                >
                                  <Trash2 size={14} aria-hidden="true" />
                                  {labels.deleteComment}
                                </ConfirmSubmitButton>
                              </form>
                            )}
                          </header>
                          <div className="discussion-post-body">
                            <MarkdownBlock html={comment.bodyHtml} />
                          </div>
                        </article>
                      );
                    })}
                    {announcement.comments.length === 0 && (
                      <p className="muted">{labels.noComments}</p>
                    )}
                  </div>

                  <form
                    action={createAnnouncementCommentAction.bind(null, announcement.id)}
                    className="discussion-composer"
                  >
                    <LazyMarkdownEditor
                      name="bodyMarkdown"
                      minHeight="6rem"
                      lineNumbers={false}
                      draftKey={`announcement:${announcement.id}:comment`}
                      resetSignal={
                        announcement.comments.filter((comment) => comment.authorId === user.id).at(-1)?.id ?? 0
                      }
                    />
                    <div className="discussion-composer-actions">
                      <button type="submit">
                        <Send size={16} aria-hidden="true" />
                        {labels.publishComment}
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            </article>
          );
        })}
        {announcements.length === 0 && <p className="muted panel p-5">{labels.empty}</p>}
      </div>
    </ForestPageLayout>
  );
}
