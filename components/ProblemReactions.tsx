import { Gauge, MessageCircleMore, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { setProblemReactionAction } from "@/lib/actions/problem-reaction-actions";

type ReactionState = {
  difficultyReaction: string | null;
  preferenceReaction: string | null;
} | null;

export function ProblemReactions({
  labels,
  problemId,
  problemSlug,
  reaction
}: {
  labels: {
    howWasIt: string;
    tooHard: string;
    tooEasy: string;
    feelsRight: string;
    more: string;
    less: string;
    somethingElse: string;
  };
  problemId: number;
  problemSlug: string;
  reaction: ReactionState;
}) {
  const difficulty = [
    { value: "TOO_HARD", label: labels.tooHard, icon: "↑" },
    { value: "TOO_EASY", label: labels.tooEasy, icon: "↓" },
    { value: "FEELS_RIGHT", label: labels.feelsRight, icon: <Gauge size={16} /> }
  ];
  const preference = [
    { value: "MORE_LIKE_THIS", label: labels.more, icon: <ThumbsUp size={16} /> },
    { value: "LESS_LIKE_THIS", label: labels.less, icon: <ThumbsDown size={16} /> }
  ];

  return (
    <div className="problem-reactions">
      <span>{labels.howWasIt}</span>
      <div>
        {difficulty.map((item) => (
          <form key={item.value} action={setProblemReactionAction.bind(null, problemId, problemSlug, "difficulty", item.value)}>
            <button
              type="submit"
              className={reaction?.difficultyReaction === item.value ? "selected" : undefined}
              title={item.label}
              aria-label={item.label}
            >
              <i>{item.icon}</i><span>{item.label}</span>
            </button>
          </form>
        ))}
        {preference.map((item) => (
          <form key={item.value} action={setProblemReactionAction.bind(null, problemId, problemSlug, "preference", item.value)}>
            <button
              type="submit"
              className={reaction?.preferenceReaction === item.value ? "selected" : undefined}
              title={item.label}
              aria-label={item.label}
            >
              <i>{item.icon}</i><span>{item.label}</span>
            </button>
          </form>
        ))}
        <Link href={`/problems/${problemSlug}/discussion`} title={labels.somethingElse} aria-label={labels.somethingElse}>
          <i><MessageCircleMore size={16} /></i><span>{labels.somethingElse}</span>
        </Link>
      </div>
    </div>
  );
}
