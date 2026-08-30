"use client";

import { Gauge, SlidersHorizontal, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { setProblemDifficultyVoteAction, setProblemReactionAction } from "@/lib/actions/problem-reaction-actions";

type ReactionState = {
  difficultyReaction: string | null;
  preferenceReaction: string | null;
} | null;

export function ProblemReactions({
  labels,
  problemId,
  problemSlug,
  reaction,
  currentDifficulty,
  difficultyVote,
  difficultyVoteCount
}: {
  labels: {
    howWasIt: string;
    tooHard: string;
    tooEasy: string;
    feelsRight: string;
    more: string;
    less: string;
    somethingElse: string;
    rateDifficulty: string;
    currentDifficulty: string;
    difficultyContext: string;
    difficultyScale: string;
    saveDifficulty: string;
    difficultySavedSingular: string;
    difficultySavedPlural: string;
  };
  problemId: number;
  problemSlug: string;
  reaction: ReactionState;
  currentDifficulty: number | null;
  difficultyVote: number | null;
  difficultyVoteCount: number;
}) {
  const [difficultyValue, setDifficultyValue] = useState(difficultyVote ?? currentDifficulty ?? 50);
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
              aria-label={item.label}
            >
              <i>{item.icon}</i><span>{item.label}</span>
            </button>
          </form>
        ))}
        <details className="problem-difficulty-vote">
          <summary aria-label={labels.rateDifficulty} title={labels.rateDifficulty}>
            <i><SlidersHorizontal size={16} /></i><span>{labels.rateDifficulty}</span>
          </summary>
          <form action={setProblemDifficultyVoteAction.bind(null, problemId, problemSlug)}>
            <strong>{labels.rateDifficulty}</strong>
            <p>{labels.currentDifficulty}: {currentDifficulty ?? "–"}</p>
            <label>
              <span className="sr-only">{labels.rateDifficulty}</span>
              <input
                type="range"
                name="difficulty"
                min="1"
                max="100"
                value={difficultyValue}
                onChange={(event) => setDifficultyValue(Number(event.target.value))}
              />
              <output>{difficultyValue}</output>
            </label>
            <small className="problem-difficulty-scale">{labels.difficultyScale}</small>
            <p><b>{labels.difficultyContext}</b></p>
            <button type="submit">{labels.saveDifficulty}</button>
            {difficultyVoteCount > 0 && (
              <small>
                {difficultyVoteCount} {difficultyVoteCount === 1
                  ? labels.difficultySavedSingular
                  : labels.difficultySavedPlural}
              </small>
            )}
          </form>
        </details>
      </div>
    </div>
  );
}
