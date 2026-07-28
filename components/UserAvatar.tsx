import { displayNameForUser } from "@/lib/user-display";
import {
  avatarBackgroundOption,
  avatarPresetFromUrl,
  defaultAvatarPath,
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
  const savedDefaultPreset = avatarPresetFromUrl(user.avatarUrl);
  const defaultPreset = savedDefaultPreset ?? defaultAvatarPresetForUsername(user.username);
  const uploadedAvatarUrl = user.avatarUrl && !savedDefaultPreset ? user.avatarUrl : null;
  const background = avatarBackgroundOption(user.username, user.avatarBackground);
  const classes = [
    "user-avatar",
    `user-avatar-${size}`,
    uploadedAvatarUrl ? null : "user-avatar-default",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      title={displayNameForUser(user)}
      aria-hidden="true"
      style={uploadedAvatarUrl ? undefined : { backgroundColor: background.color }}
    >
      {uploadedAvatarUrl ? (
        <img src={uploadedAvatarUrl} alt="" loading={size === "xl" ? "eager" : "lazy"} referrerPolicy="no-referrer" />
      ) : (
        <img
          src={defaultAvatarPath(defaultPreset)}
          alt=""
          loading={size === "xl" ? "eager" : "lazy"}
        />
      )}
    </span>
  );
}
