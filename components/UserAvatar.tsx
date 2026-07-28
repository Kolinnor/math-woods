import { displayNameForUser } from "@/lib/user-display";

type AvatarUser = {
  avatarUrl?: string | null;
  displayName?: string | null;
  username: string;
};

type UserAvatarProps = {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  user: AvatarUser;
};

export function userInitials(user: AvatarUser) {
  const name = displayNameForUser(user);
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
    : name.slice(0, 2);
  return initials.toLocaleUpperCase();
}

export function avatarToneForUsername(username: string) {
  let hash = 0;
  for (const character of username) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % 6;
}

export function UserAvatar({ className, size = "md", user }: UserAvatarProps) {
  const classes = [
    "user-avatar",
    `user-avatar-${size}`,
    `user-avatar-tone-${avatarToneForUsername(user.username)}`,
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} title={displayNameForUser(user)} aria-hidden="true">
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" loading={size === "xl" ? "eager" : "lazy"} referrerPolicy="no-referrer" />
      ) : (
        <span>{userInitials(user)}</span>
      )}
    </span>
  );
}
