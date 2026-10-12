import type { DiscussionReplyPreview } from "@/lib/discussion-reply-preview";

export function DiscussionReplyQuote({ reply, anchorPrefix, locale }: {
  reply: DiscussionReplyPreview | null;
  anchorPrefix: "post" | "comment";
  locale: "fr" | "en";
}) {
  if (!reply) return <div className="discussion-reply-quote muted">{locale === "fr" ? "Commentaire d’origine supprimé." : "Original comment deleted."}</div>;
  return <a className="discussion-reply-quote" href={`#${anchorPrefix}-${reply.id}`}>
    <strong>{locale === "fr" ? `En réponse à ${reply.authorName}` : `In reply to ${reply.authorName}`}</strong>
    <span>{reply.excerpt}</span>
  </a>;
}
