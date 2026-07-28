import { displayNameForUser } from "@/lib/user-display";
import {
  avatarBackgroundOption,
  defaultAvatarPresetForUsername
} from "@/lib/avatar-presets";

type AvatarUser = {
  avatarBackground?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  username: string;
};

type UserAvatarProps = {
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  user: AvatarUser;
};

export function UserAvatar({ className, size = "md", user }: UserAvatarProps) {
  const defaultPreset = defaultAvatarPresetForUsername(user.username);
  const background = avatarBackgroundOption(user.username, user.avatarBackground);
  const classes = [
    "user-avatar",
    `user-avatar-${size}`,
    user.avatarUrl ? null : "user-avatar-default",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      title={displayNameForUser(user)}
      aria-hidden="true"
      style={user.avatarUrl ? undefined : { backgroundColor: background.color }}
    >
      {user.avatarUrl ? (
        <img src={user.avatarUrl} alt="" loading={size === "xl" ? "eager" : "lazy"} referrerPolicy="no-referrer" />
      ) : (
        <img
          src={`/avatars/default/${defaultPreset}.svg`}
          alt=""
          loading={size === "xl" ? "eager" : "lazy"}
        />
      )}
    </span>
  );
}
