import { Bell, BellOff } from "lucide-react";
import { setDiscussionFollowingAction } from "@/lib/actions/discussion-follow-actions";
import { getDiscussionFollowing } from "@/lib/discussion-follows";
import type { DiscussionTarget } from "@/lib/discussion-follow-policy";

export async function DiscussionFollowControl({ target, userId, isAuthor, locale }: {
  target: DiscussionTarget;
  userId: number;
  isAuthor: boolean;
  locale: string;
}) {
  const { following, muted } = await getDiscussionFollowing(target, userId, isAuthor);
  const fr = locale === "fr";
  return (
    <form action={setDiscussionFollowingAction.bind(null, target, !following)} className="discussion-follow-control">
      <p className="muted">
        {following
          ? (fr ? "Vous suivez cette discussion. Les nouveaux messages vous seront notifiés selon vos paramètres de notifications." : "You follow this discussion. New messages will notify you according to your notification settings.")
          : muted
            ? (fr ? "Vous ne suivez plus cette discussion, même si vous participez à nouveau." : "You have unfollowed this discussion, even if you post again.")
            : (fr ? "Vous suivrez automatiquement cette discussion dès votre première participation. Vous pourrez arrêter le suivi à tout moment." : "You will follow this discussion automatically from your first contribution. You can unfollow at any time.")}
      </p>
      <button type="submit" className="secondary">
        {following ? <BellOff size={16} aria-hidden="true" /> : <Bell size={16} aria-hidden="true" />}
        {following
          ? (fr ? "Ne plus suivre cette discussion" : "Unfollow this discussion")
          : (fr ? "Suivre cette discussion" : "Follow this discussion")}
      </button>
    </form>
  );
}
