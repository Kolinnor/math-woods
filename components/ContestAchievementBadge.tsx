import { Medal, Trophy } from "lucide-react";

type ContestAchievementBadgeProps = {
  wins: number;
  honorableMentions: number;
  tooltip: string;
};

export function ContestAchievementBadge({ wins, honorableMentions, tooltip }: ContestAchievementBadgeProps) {
  if (wins <= 0 && honorableMentions <= 0) return null;
  const isWinner = wins > 0;
  const Icon = isWinner ? Trophy : Medal;

  return (
    <span
      className={`avatar-achievement-badge${isWinner ? " avatar-achievement-badge-winner" : ""}`}
      title={tooltip}
    >
      <Icon size={10} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}
