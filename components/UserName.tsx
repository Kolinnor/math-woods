import { type AvatarAchievement, UserAvatar } from "@/components/UserAvatar";
import { displayNameForUser } from "@/lib/user-display";

type NamedUser = {
  avatarBackground?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  username: string;
};

type UserNameProps = {
  achievement?: AvatarAchievement;
  avatarSize?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  user: NamedUser;
};

export function UserName({ achievement, avatarSize = "xs", className, user }: UserNameProps) {
  return (
    <span className={["user-name-with-avatar", className].filter(Boolean).join(" ")}>
      <UserAvatar user={user} size={avatarSize} achievement={achievement} />
      <span>{displayNameForUser(user)}</span>
    </span>
  );
}
