import { MarkdownBlock } from "@/components/MarkdownBlock";
import { SiteAnnouncementAcknowledgeButton } from "@/components/SiteAnnouncementAcknowledgeButton";
import { prisma } from "@/lib/db";
import { getInterfaceLocale } from "@/lib/i18n/server";

export async function SiteAnnouncementToast({ userId }: { userId: number }) {
  const recipient = await prisma.siteAnnouncementRecipient.findFirst({
    where: {
      userId,
      acknowledgedAt: null,
      announcement: { cancelledAt: null }
    },
    orderBy: { createdAt: "asc" },
    include: { announcement: true }
  });
  if (!recipient) return null;

  const locale = await getInterfaceLocale();
  const labels = locale === "fr"
    ? { eyebrow: "Message de Math Woods", acknowledge: "J’ai compris", pending: "Validation…" }
    : { eyebrow: "Message from Math Woods", acknowledge: "Got it", pending: "Confirming..." };

  return (
    <aside className="site-announcement-toast" aria-live="assertive" aria-labelledby={`site-announcement-${recipient.announcementId}`}>
      <p className="site-announcement-eyebrow">{labels.eyebrow}</p>
      <h2 id={`site-announcement-${recipient.announcementId}`}>{recipient.announcement.title}</h2>
      <div className="site-announcement-body">
        <MarkdownBlock html={recipient.announcement.bodyHtml} />
      </div>
      <SiteAnnouncementAcknowledgeButton
        announcementId={recipient.announcementId}
        label={labels.acknowledge}
        pendingLabel={labels.pending}
      />
    </aside>
  );
}
