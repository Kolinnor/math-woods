const DIFFICULTY_TONES = {
  unset: "#8a9184",
  gentle: "#5d7a4c",
  approachable: "#788145",
  intermediate: "#a07a2c",
  advanced: "#b05f2c",
  extreme: "#8c3b22"
} as const;

export function problemDifficultyTone(difficulty: number | null) {
  if (!difficulty) return DIFFICULTY_TONES.unset;
  if (difficulty <= 25) return DIFFICULTY_TONES.gentle;
  if (difficulty <= 45) return DIFFICULTY_TONES.approachable;
  if (difficulty <= 65) return DIFFICULTY_TONES.intermediate;
  if (difficulty <= 85) return DIFFICULTY_TONES.advanced;
  return DIFFICULTY_TONES.extreme;
}

export function problemDifficultyBars(difficulty: number | null) {
  if (!difficulty) return 0;
  if (difficulty <= 25) return 1;
  if (difficulty <= 45) return 2;
  if (difficulty <= 65) return 3;
  return 4;
}
