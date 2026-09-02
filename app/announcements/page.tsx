import { AnnouncementSeenMarker } from "@/components/AnnouncementSeenMarker";
import { DeleteAnnouncementButton } from "@/components/DeleteAnnouncementButton";
import { ForestPageLayout } from "@/components/ForestPageLayout";
import { MarkdownBlock } from "@/components/MarkdownBlock";
import { UserName } from "@/components/UserName";
import { createAnnouncementAction } from "@/lib/actions/announcement-actions";
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
      }
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
            </article>
          );
        })}
        {announcements.length === 0 && <p className="muted panel p-5">{labels.empty}</p>}
      </div>
    </ForestPageLayout>
  );
}
