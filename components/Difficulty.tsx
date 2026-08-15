import { problemDifficultyBars, problemDifficultyTone } from "@/lib/problem-difficulty";

export function Difficulty({
  compact = false,
  value
}: {
  compact?: boolean;
  value: number | null;
}) {
  const level = problemDifficultyBars(value);
  const tone = problemDifficultyTone(value);

  return (
    <span
      className={compact ? "mw-difficulty mw-difficulty-compact" : "mw-difficulty"}
      aria-label={value === null ? "Difficulty not rated" : `Difficulty ${value} out of 100`}
    >
      <strong style={{ color: tone }}>{value ?? "--"}</strong>
      <span className="mw-difficulty-bars" aria-hidden="true">
        {[1, 2, 3, 4, 5, 6].map((bar) => (
          <i key={bar} style={bar <= level ? { backgroundColor: tone } : undefined} />
        ))}
      </span>
    </span>
  );
}
