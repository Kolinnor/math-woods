import { displayNameForUser } from "./user-display.ts";

export type DiscussionReplyPreview = { id: number; authorName: string; excerpt: string };

export function discussionReplyPreview(post: {
  id: number;
  author: { username: string; displayName?: string | null };
  bodyMarkdown: string;
  type?: string;
}, locale: "fr" | "en"): DiscussionReplyPreview {
  // Never leak an unrevealed hint through a quote or a reply button's props.
  const text = post.type === "HINT"
    ? (locale === "fr" ? "Indication masquée — ouvrir le message pour la consulter." : "Hidden hint — open the message to view it.")
    : post.bodyMarkdown.replace(/\s+/g, " ").trim();
  return {
    id: post.id,
    authorName: displayNameForUser(post.author),
    excerpt: text.length > 180 ? `${text.slice(0, 179)}…` : text
  };
}
