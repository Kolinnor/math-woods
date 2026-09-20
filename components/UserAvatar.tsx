import { ContestAchievementBadge } from "@/components/ContestAchievementBadge";
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

export type AvatarAchievement = {
  wins: number;
  honorableMentions: number;
  tooltip: string;
};

type UserAvatarProps = {
  achievement?: AvatarAchievement;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  user: AvatarUser;
};

export function UserAvatar({ achievement, className, size = "md", user }: UserAvatarProps) {
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
  const hasBadge = Boolean(achievement && (achievement.wins > 0 || achievement.honorableMentions > 0));

  const avatar = (
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

  if (!hasBadge) return avatar;

  return (
    <span className="user-avatar-badge-wrap">
      {avatar}
      <ContestAchievementBadge
        wins={achievement!.wins}
        honorableMentions={achievement!.honorableMentions}
        tooltip={achievement!.tooltip}
      />
    </span>
  );
}
