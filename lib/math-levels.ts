import { UserMathLevel } from "@prisma/client";

export const MATH_LEVEL_OPTIONS: Array<{
  value: UserMathLevel;
  label: string;
  range: string;
  description: string;
}> = [
  {
    value: UserMathLevel.BEGINNER_PRE_UNIVERSITY,
    label: "First steps / Middle school",
    range: "level 1-10",
    description: "Middle-school reference level, gentle definitions, and introductory examples."
  },
  {
    value: UserMathLevel.EARLY_UNDERGRAD,
    label: "Beginner / High school",
    range: "level 10-25",
    description: "High-school mathematics, early problem-solving habits, and friendly warm-ups."
  },
  {
    value: UserMathLevel.UNDERGRAD,
    label: "Intermediate / Undergraduate",
    range: "level 25-50",
    description: "Undergraduate-style problems and standard mathematical tools."
  },
  {
    value: UserMathLevel.ADVANCED_UNDERGRAD,
    label: "Advanced / Graduate",
    range: "level 50-70",
    description: "Graduate-level material and demanding multi-step problems."
  },
  {
    value: UserMathLevel.GRADUATE_CONTEST,
    label: "Expert / Specialized",
    range: "level 70-90",
    description: "Highly specialized problems, technical arguments, and advanced competitions."
  },
  {
    value: UserMathLevel.RESEARCH,
    label: "Research-level",
    range: "level 90-100",
    description: "Research-level mathematics and very specialized problems."
  }
];

export const MATH_LEVEL_HELP_TEXT =
  "This only helps choose which problems to show first. You can change it anytime.";

export function parseMathLevel(value: FormDataEntryValue | string | null | undefined) {
  const input = String(value ?? "") as UserMathLevel;
  return Object.values(UserMathLevel).includes(input) ? input : null;
}

export function mathLevelLabel(level: UserMathLevel | null | undefined) {
  if (!level) return "Not set";
  const option = MATH_LEVEL_OPTIONS.find((item) => item.value === level);
  return option ? `${option.label} (${option.range})` : "Not set";
}
