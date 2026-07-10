import { UserMathLevel } from "@prisma/client";

export const MATH_LEVEL_OPTIONS: Array<{
  value: UserMathLevel;
  label: string;
  range: string;
  description: string;
}> = [
  {
    value: UserMathLevel.BEGINNER_PRE_UNIVERSITY,
    label: "Introductory",
    range: "level 1-5",
    description: "Very first steps, gentle definitions, and introductory examples."
  },
  {
    value: UserMathLevel.EARLY_UNDERGRAD,
    label: "Beginner / High school",
    range: "level 6-19",
    description: "High-school mathematics, early problem-solving habits, and friendly warm-ups."
  },
  {
    value: UserMathLevel.UNDERGRAD,
    label: "Intermediate / Undergraduate",
    range: "level 20-39",
    description: "Undergraduate-style problems and standard mathematical tools."
  },
  {
    value: UserMathLevel.ADVANCED_UNDERGRAD,
    label: "Advanced / Graduate",
    range: "level 40-64",
    description: "Advanced undergraduate or graduate-level material."
  },
  {
    value: UserMathLevel.GRADUATE_CONTEST,
    label: "Expert / Specialized",
    range: "level 65-84",
    description: "Demanding problems, technical arguments, and research-adjacent reading."
  },
  {
    value: UserMathLevel.RESEARCH,
    label: "Research-level",
    range: "level 85-100",
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
