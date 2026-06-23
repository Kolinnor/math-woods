export const DEFAULT_LATEX_CUSTOM_COMMANDS = `% One shortcut per line: trigger => replacement
RR => \\mathbb{R}
NN => \\mathbb{N}
ZZ => \\mathbb{Z}
QQ => \\mathbb{Q}
CC => \\mathbb{C}
eps => \\varepsilon
inn => \\in
notin => \\notin
implies => \\Rightarrow
iff => \\Longleftrightarrow`;

export const DEFAULT_LATEX_PREFERENCES = {
  autocloseDollars: true,
  mathShortcuts: true,
  moveCursorBetweenDollars: true,
  encloseSelectionDollars: true,
  autocloseCurlyBrackets: false,
  autocloseSquareBrackets: false,
  autocloseRoundBrackets: false,
  appendSumLimits: true,
  autoEnlargeBrackets: true,
  superscriptBraces: true,
  subscriptBraces: true,
  slashFractions: false,
  alignShortcut: true,
  alignEnvironment: "align*",
  autoAlignSymbols: "= > < \\le \\ge \\neq \\approx",
  casesShortcut: true,
  shiftEnterLineBreaks: false,
  matrixShortcut: true,
  matrixEnvironment: "pmatrix",
  greekMathMode: true,
  customShorthand: true,
  tabCompletesShorthand: false,
  customCommands: DEFAULT_LATEX_CUSTOM_COMMANDS
};

export type LatexPreferenceValues = typeof DEFAULT_LATEX_PREFERENCES;

const booleanPreferenceKeys = [
  "autocloseDollars",
  "mathShortcuts",
  "moveCursorBetweenDollars",
  "encloseSelectionDollars",
  "autocloseCurlyBrackets",
  "autocloseSquareBrackets",
  "autocloseRoundBrackets",
  "appendSumLimits",
  "autoEnlargeBrackets",
  "superscriptBraces",
  "subscriptBraces",
  "slashFractions",
  "alignShortcut",
  "casesShortcut",
  "shiftEnterLineBreaks",
  "matrixShortcut",
  "greekMathMode",
  "customShorthand",
  "tabCompletesShorthand"
] as const;

function cleanTextField(value: FormDataEntryValue | null, fallback: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

export function mergeLatexPreferences(
  preference: Partial<LatexPreferenceValues> | null | undefined
): LatexPreferenceValues {
  return {
    ...DEFAULT_LATEX_PREFERENCES,
    ...preference
  };
}

export function parseLatexPreferenceForm(formData: FormData): LatexPreferenceValues {
  const parsed = { ...DEFAULT_LATEX_PREFERENCES };

  for (const key of booleanPreferenceKeys) {
    parsed[key] = formData.get(key) === "on";
  }

  parsed.alignEnvironment = cleanTextField(formData.get("alignEnvironment"), "align*", 40);
  parsed.autoAlignSymbols = cleanTextField(formData.get("autoAlignSymbols"), DEFAULT_LATEX_PREFERENCES.autoAlignSymbols, 200);
  parsed.matrixEnvironment = cleanTextField(formData.get("matrixEnvironment"), "pmatrix", 40);
  parsed.customCommands = cleanTextField(formData.get("customCommands"), DEFAULT_LATEX_CUSTOM_COMMANDS, 5000);

  return parsed;
}
