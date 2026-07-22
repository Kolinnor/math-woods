const UNSET_DIFFICULTY_TONE = "#8a9184";
const DIFFICULTY_TONE_STOPS = [
  { value: 1, rgb: [79, 121, 85] },
  { value: 20, rgb: [97, 122, 66] },
  { value: 40, rgb: [133, 122, 53] },
  { value: 60, rgb: [162, 104, 49] },
  { value: 80, rgb: [168, 77, 47] },
  { value: 100, rgb: [135, 52, 45] }
] as const;

function channelHex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0");
}

function interpolateTone(
  lower: (typeof DIFFICULTY_TONE_STOPS)[number],
  upper: (typeof DIFFICULTY_TONE_STOPS)[number],
  value: number
) {
  const progress = (value - lower.value) / (upper.value - lower.value);
  return `#${lower.rgb
    .map((channel, index) => channelHex(channel + (upper.rgb[index] - channel) * progress))
    .join("")}`;
}

export function problemDifficultyTone(difficulty: number | null) {
  if (!difficulty) return UNSET_DIFFICULTY_TONE;
  const value = Math.min(100, Math.max(1, difficulty));
  const upperIndex = DIFFICULTY_TONE_STOPS.findIndex((stop) => value <= stop.value);
  if (upperIndex <= 0) {
    const [red, green, blue] = DIFFICULTY_TONE_STOPS[0].rgb;
    return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
  }
  return interpolateTone(DIFFICULTY_TONE_STOPS[upperIndex - 1], DIFFICULTY_TONE_STOPS[upperIndex], value);
}

export function problemDifficultyBars(difficulty: number | null) {
  if (!difficulty) return 0;
  if (difficulty <= 25) return 1;
  if (difficulty <= 45) return 2;
  if (difficulty <= 65) return 3;
  return 4;
}
