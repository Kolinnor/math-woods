import { UserAvatar } from "@/components/UserAvatar";
import { displayNameForUser } from "@/lib/user-display";

type NamedUser = {
  avatarBackground?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  username: string;
};

type UserNameProps = {
  className?: string;
  user: NamedUser;
};

export function UserName({ className, user }: UserNameProps) {
  return (
    <span className={["user-name-with-avatar", className].filter(Boolean).join(" ")}>
      <UserAvatar user={user} size="xs" />
      <span>{displayNameForUser(user)}</span>
    </span>
  );
}
