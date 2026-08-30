const UNSET_DIFFICULTY_TONE = "#8a9184";
export const PROBLEM_DIFFICULTY_HELP =
  "The 1-100 score reflects both the level of the required concepts and the difficulty of the solution. 1-10: First steps / middle school. 11-25: Beginner / high school. 26-50: Intermediate / undergraduate. 51-70: Advanced / graduate. 71-90: Expert / specialized. 91-100: Research-level.";

export const PROBLEM_DIFFICULTY_BANDS = [
  { min: 1, max: 10, shortEn: "First steps", shortFr: "Premiers pas", detailEn: "First steps / middle school", detailFr: "Premiers pas / collège" },
  { min: 11, max: 25, shortEn: "High school", shortFr: "Lycée", detailEn: "Beginner / high school", detailFr: "Débutant / lycée" },
  { min: 26, max: 50, shortEn: "Undergraduate", shortFr: "Licence", detailEn: "Intermediate / undergraduate", detailFr: "Intermédiaire / licence" },
  { min: 51, max: 70, shortEn: "Graduate", shortFr: "Master", detailEn: "Advanced / graduate", detailFr: "Avancé / master" },
  { min: 71, max: 90, shortEn: "Expert", shortFr: "Expert", detailEn: "Expert / specialized", detailFr: "Expert / spécialisé" },
  { min: 91, max: 100, shortEn: "Research", shortFr: "Recherche", detailEn: "Research level", detailFr: "Niveau recherche" }
] as const;

export function problemDifficultyBand(difficulty: number | null) {
  if (!difficulty) return null;
  const value = Math.min(100, Math.max(1, difficulty));
  return PROBLEM_DIFFICULTY_BANDS.find((band) => value >= band.min && value <= band.max)
    ?? PROBLEM_DIFFICULTY_BANDS.at(-1)!;
}

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
  const band = problemDifficultyBand(difficulty);
  return band ? PROBLEM_DIFFICULTY_BANDS.indexOf(band) + 1 : 0;
}
