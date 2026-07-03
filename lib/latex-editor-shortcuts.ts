import { DEFAULT_LATEX_PREFERENCES, type LatexPreferenceValues } from "./latex-preferences.ts";
import { findLatexRanges } from "./latex-ranges.ts";

export type LatexEditorChange = {
  from: number;
  to: number;
  insert: string;
};

export type LatexEditorShortcutResult = {
  changes: LatexEditorChange | LatexEditorChange[];
  anchor?: number;
};

type KeyboardShortcutEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
};

const GREEK_COMMANDS = new Set([
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "varpi",
  "rho",
  "varrho",
  "sigma",
  "varsigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Xi",
  "Pi",
  "Sigma",
  "Upsilon",
  "Phi",
  "Psi",
  "Omega"
]);

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function latexEditorPreferencesFromApi(data: unknown): LatexPreferenceValues {
  if (!data || typeof data !== "object") return DEFAULT_LATEX_PREFERENCES;
  const raw = data as Partial<Record<keyof LatexPreferenceValues, unknown>>;

  return {
    ...DEFAULT_LATEX_PREFERENCES,
    autocloseDollars: asBoolean(raw.autocloseDollars, DEFAULT_LATEX_PREFERENCES.autocloseDollars),
    mathShortcuts: asBoolean(raw.mathShortcuts, DEFAULT_LATEX_PREFERENCES.mathShortcuts),
    moveCursorBetweenDollars: asBoolean(raw.moveCursorBetweenDollars, DEFAULT_LATEX_PREFERENCES.moveCursorBetweenDollars),
    encloseSelectionDollars: asBoolean(raw.encloseSelectionDollars, DEFAULT_LATEX_PREFERENCES.encloseSelectionDollars),
    autocloseCurlyBrackets: asBoolean(raw.autocloseCurlyBrackets, DEFAULT_LATEX_PREFERENCES.autocloseCurlyBrackets),
    autocloseSquareBrackets: asBoolean(raw.autocloseSquareBrackets, DEFAULT_LATEX_PREFERENCES.autocloseSquareBrackets),
    autocloseRoundBrackets: asBoolean(raw.autocloseRoundBrackets, DEFAULT_LATEX_PREFERENCES.autocloseRoundBrackets),
    appendSumLimits: asBoolean(raw.appendSumLimits, DEFAULT_LATEX_PREFERENCES.appendSumLimits),
    autoEnlargeBrackets: asBoolean(raw.autoEnlargeBrackets, DEFAULT_LATEX_PREFERENCES.autoEnlargeBrackets),
    superscriptBraces: asBoolean(raw.superscriptBraces, DEFAULT_LATEX_PREFERENCES.superscriptBraces),
    subscriptBraces: asBoolean(raw.subscriptBraces, DEFAULT_LATEX_PREFERENCES.subscriptBraces),
    slashFractions: asBoolean(raw.slashFractions, DEFAULT_LATEX_PREFERENCES.slashFractions),
    alignShortcut: asBoolean(raw.alignShortcut, DEFAULT_LATEX_PREFERENCES.alignShortcut),
    alignEnvironment: cleanEnvironmentName(asString(raw.alignEnvironment, DEFAULT_LATEX_PREFERENCES.alignEnvironment), DEFAULT_LATEX_PREFERENCES.alignEnvironment),
    autoAlignSymbols: asString(raw.autoAlignSymbols, DEFAULT_LATEX_PREFERENCES.autoAlignSymbols),
    casesShortcut: asBoolean(raw.casesShortcut, DEFAULT_LATEX_PREFERENCES.casesShortcut),
    shiftEnterLineBreaks: asBoolean(raw.shiftEnterLineBreaks, DEFAULT_LATEX_PREFERENCES.shiftEnterLineBreaks),
    matrixShortcut: asBoolean(raw.matrixShortcut, DEFAULT_LATEX_PREFERENCES.matrixShortcut),
    matrixEnvironment: cleanEnvironmentName(asString(raw.matrixEnvironment, DEFAULT_LATEX_PREFERENCES.matrixEnvironment), DEFAULT_LATEX_PREFERENCES.matrixEnvironment),
    greekMathMode: asBoolean(raw.greekMathMode, DEFAULT_LATEX_PREFERENCES.greekMathMode),
    customShorthand: asBoolean(raw.customShorthand, DEFAULT_LATEX_PREFERENCES.customShorthand),
    tabCompletesShorthand: asBoolean(raw.tabCompletesShorthand, DEFAULT_LATEX_PREFERENCES.tabCompletesShorthand),
    customCommands: asString(raw.customCommands, DEFAULT_LATEX_PREFERENCES.customCommands),
    markdownHeadingShortcuts: asBoolean(raw.markdownHeadingShortcuts, DEFAULT_LATEX_PREFERENCES.markdownHeadingShortcuts),
    markdownHeading1Shortcut: asString(raw.markdownHeading1Shortcut, DEFAULT_LATEX_PREFERENCES.markdownHeading1Shortcut),
    markdownHeading2Shortcut: asString(raw.markdownHeading2Shortcut, DEFAULT_LATEX_PREFERENCES.markdownHeading2Shortcut),
    markdownHeading3Shortcut: asString(raw.markdownHeading3Shortcut, DEFAULT_LATEX_PREFERENCES.markdownHeading3Shortcut),
    markdownHeading4Shortcut: asString(raw.markdownHeading4Shortcut, DEFAULT_LATEX_PREFERENCES.markdownHeading4Shortcut),
    markdownHeading5Shortcut: asString(raw.markdownHeading5Shortcut, DEFAULT_LATEX_PREFERENCES.markdownHeading5Shortcut),
    markdownHeading6Shortcut: asString(raw.markdownHeading6Shortcut, DEFAULT_LATEX_PREFERENCES.markdownHeading6Shortcut)
  };
}

export function parseLatexCustomCommands(source: string) {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%"))
    .map((line) => {
      const separator = line.includes("=>") ? "=>" : line.includes("=") ? "=" : null;
      if (!separator) return null;
      const [trigger, ...replacementParts] = line.split(separator);
      const replacement = replacementParts.join(separator).trim();
      const cleanedTrigger = trigger.trim();
      if (!cleanedTrigger || !replacement || /\s/.test(cleanedTrigger)) return null;
      return { trigger: cleanedTrigger, replacement };
    })
    .filter((entry): entry is { trigger: string; replacement: string } => Boolean(entry))
    .sort((a, b) => b.trigger.length - a.trigger.length);
}

function cleanEnvironmentName(value: string, fallback: string) {
  const trimmed = value.trim();
  return /^[A-Za-z][A-Za-z*]*$/.test(trimmed) ? trimmed : fallback;
}

function lineBounds(text: string, position: number) {
  const from = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  const nextLineBreak = text.indexOf("\n", position);
  const to = nextLineBreak === -1 ? text.length : nextLineBreak;
  return { from, to, text: text.slice(from, to) };
}

function hasUnescapedOddBackticks(lineText: string) {
  let count = 0;
  for (let index = 0; index < lineText.length; index += 1) {
    if (lineText[index] !== "`") continue;
    if (index > 0 && lineText[index - 1] === "\\") continue;
    count += 1;
  }
  return count % 2 === 1;
}

function isInsideMarkdownCode(text: string, position: number) {
  const before = text.slice(0, position);
  const fences = before.match(/^```/gm);
  if (fences && fences.length % 2 === 1) return true;

  const line = lineBounds(text, position);
  return hasUnescapedOddBackticks(text.slice(line.from, position));
}

function latexRangeAt(text: string, position: number) {
  return findLatexRanges(text).find((range) => position > range.from && position < range.to) ?? null;
}

function selectionText(text: string, from: number, to: number) {
  return from === to ? "" : text.slice(from, to);
}

function selectedOrPlaceholder(text: string, from: number, to: number, placeholder = "") {
  const selected = selectionText(text, from, to);
  return {
    selected,
    body: selected || placeholder
  };
}

function bracketPairForTextInput(input: string, preferences: LatexPreferenceValues) {
  if (input === "{" && preferences.autocloseCurlyBrackets) return ["{", "}"] as const;
  if (input === "[" && preferences.autocloseSquareBrackets) return ["[", "]"] as const;
  if (input === "(" && preferences.autocloseRoundBrackets) return ["(", ")"] as const;
  return null;
}

function containsLargeLatexExpression(text: string) {
  return /\\(?:sum|int|prod|frac|sqrt)\b/.test(text);
}

function wrapWithBracketPair(
  text: string,
  from: number,
  to: number,
  open: string,
  close: string,
  preferences: LatexPreferenceValues
): LatexEditorShortcutResult {
  const { selected } = selectedOrPlaceholder(text, from, to);
  const useLargeBrackets = Boolean(selected && preferences.autoEnlargeBrackets && containsLargeLatexExpression(selected));
  const prefix = useLargeBrackets ? `\\left${open}` : open;
  const suffix = useLargeBrackets ? `\\right${close}` : close;
  const insert = `${prefix}${selected}${suffix}`;
  return {
    changes: { from, to, insert },
    anchor: from + prefix.length + selected.length
  };
}

function previousLatexToken(text: string, rangeFrom: number, cursor: number) {
  const before = text.slice(rangeFrom, cursor);
  const match = before.match(/(?:\\[A-Za-z]+|[A-Za-z0-9]+|\{[^{}\n]+\}|\([^()\n]+\))$/);
  if (!match) return null;
  const token = match[0];
  return {
    from: cursor - token.length,
    to: cursor,
    text: token
  };
}

function customCommandBeforeCursor(text: string, cursor: number, preferences: LatexPreferenceValues) {
  const commands = parseLatexCustomCommands(preferences.customCommands);
  const before = text.slice(0, cursor);
  return commands.find((command) => before.endsWith(command.trigger)) ?? null;
}

function expandCustomCommand(text: string, cursor: number, preferences: LatexPreferenceValues, suffix: string) {
  if (!preferences.customShorthand) return null;
  const range = latexRangeAt(text, cursor);
  if (!range) return null;
  const command = customCommandBeforeCursor(text, cursor, preferences);
  if (!command) return null;

  const from = cursor - command.trigger.length;
  return {
    changes: { from, to: cursor, insert: `${command.replacement}${suffix}` },
    anchor: from + command.replacement.length + suffix.length
  } satisfies LatexEditorShortcutResult;
}

function wrapGreekCommandOutsideMath(text: string, cursor: number) {
  const before = text.slice(0, cursor);
  const match = before.match(/\\([A-Za-z]+)$/);
  if (!match || !GREEK_COMMANDS.has(match[1])) return null;
  const command = match[0];
  const from = cursor - command.length;
  return {
    changes: { from, to: cursor, insert: `$${command}$ ` },
    anchor: from + command.length + 3
  } satisfies LatexEditorShortcutResult;
}

function appendSumLimits(text: string, cursor: number) {
  if (!text.slice(0, cursor).endsWith("\\sum")) return null;
  return {
    changes: { from: cursor - "\\sum".length, to: cursor, insert: "\\sum\\limits " },
    anchor: cursor + "\\limits ".length
  } satisfies LatexEditorShortcutResult;
}

function slashFraction(text: string, cursor: number) {
  const range = latexRangeAt(text, cursor);
  if (!range) return null;
  const token = previousLatexToken(text, range.from, cursor);
  if (!token) return null;

  const replacement = `\\frac{${token.text}}{}`;
  return {
    changes: { from: token.from, to: token.to, insert: replacement },
    anchor: token.from + replacement.length - 1
  } satisfies LatexEditorShortcutResult;
}

export function latexTextInputShortcut(
  source: string,
  from: number,
  to: number,
  input: string,
  preferences: LatexPreferenceValues
): LatexEditorShortcutResult | null {
  if (isInsideMarkdownCode(source, from)) return null;

  if (input === "$" && preferences.autocloseDollars) {
    const selected = selectionText(source, from, to);
    if (selected && preferences.encloseSelectionDollars) {
      return {
        changes: { from, to, insert: `$${selected}$` },
        anchor: from + selected.length + 2
      };
    }

    if (from === to && source[from - 1] === "$" && source[from] === "$") {
      return {
        changes: { from, to, insert: "$$" },
        anchor: from + 1
      };
    }

    if (from === to && source[from] === "$") {
      return {
        changes: { from, to, insert: "" },
        anchor: from + 1
      };
    }

    return {
      changes: { from, to, insert: "$$" },
      anchor: from + (preferences.moveCursorBetweenDollars ? 1 : 2)
    };
  }

  const range = latexRangeAt(source, from);
  const pair = bracketPairForTextInput(input, preferences);
  if (pair && range) return wrapWithBracketPair(source, from, to, pair[0], pair[1], preferences);

  if (input === "^" && range && preferences.superscriptBraces) {
    const selected = selectionText(source, from, to);
    return {
      changes: { from, to, insert: `^{${selected}}` },
      anchor: from + 2 + selected.length
    };
  }

  if (input === "_" && range && preferences.subscriptBraces) {
    const selected = selectionText(source, from, to);
    return {
      changes: { from, to, insert: `_{${selected}}` },
      anchor: from + 2 + selected.length
    };
  }

  if (input === "/" && range && preferences.slashFractions) return slashFraction(source, from);

  if (input === " ") {
    if (range && preferences.appendSumLimits) {
      const result = appendSumLimits(source, from);
      if (result) return result;
    }

    if (!preferences.tabCompletesShorthand) {
      const result = expandCustomCommand(source, from, preferences, " ");
      if (result) return result;
    }

    if (!range && preferences.greekMathMode) {
      const result = wrapGreekCommandOutsideMath(source, from);
      if (result) return result;
    }
  }

  return null;
}

export function latexTabShortcut(source: string, cursor: number, preferences: LatexPreferenceValues) {
  if (!preferences.tabCompletesShorthand) return null;
  return expandCustomCommand(source, cursor, preferences, "");
}

function autoAlignLine(line: string, symbols: string) {
  if (line.includes("&")) return line;
  const candidates = symbols
    .split(/\s+/)
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const symbol of candidates) {
    const index = line.indexOf(symbol);
    if (index > 0) return `${line.slice(0, index)}&${line.slice(index)}`;
  }

  return line;
}

function selectedLinesForBlock(text: string, from: number, to: number) {
  return selectionText(text, from, to)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function blockInsertion(text: string, from: number, to: number, body: string) {
  const line = lineBounds(text, from);
  const before = text.slice(line.from, from);
  const after = text.slice(to, line.to);
  const prefix = before.trim() ? "\n\n" : "";
  const suffix = after.trim() ? "\n\n" : "";
  return {
    from,
    to,
    insert: `${prefix}${body}${suffix}`,
    bodyOffset: prefix.length
  };
}

export function latexInlineMathShortcut(source: string, from: number, to: number, preferences: LatexPreferenceValues) {
  if (!preferences.mathShortcuts || isInsideMarkdownCode(source, from)) return null;
  const selected = selectionText(source, from, to);
  return {
    changes: { from, to, insert: `$${selected}$` },
    anchor: from + (selected ? selected.length + 2 : 1)
  } satisfies LatexEditorShortcutResult;
}

export function latexDisplayMathShortcut(source: string, from: number, to: number, preferences: LatexPreferenceValues) {
  if (!preferences.mathShortcuts || isInsideMarkdownCode(source, from)) return null;
  const selected = selectionText(source, from, to).trim();
  const body = selected ? `$$\n${selected}\n$$` : "$$\n\n$$";
  const insertion = blockInsertion(source, from, to, body);
  return {
    changes: { from: insertion.from, to: insertion.to, insert: insertion.insert },
    anchor: from + insertion.bodyOffset + (selected ? body.length : 3)
  } satisfies LatexEditorShortcutResult;
}

export function latexAlignShortcut(source: string, from: number, to: number, preferences: LatexPreferenceValues) {
  if (!preferences.alignShortcut || isInsideMarkdownCode(source, from)) return null;
  const environment = cleanEnvironmentName(preferences.alignEnvironment, DEFAULT_LATEX_PREFERENCES.alignEnvironment);
  const lines = selectedLinesForBlock(source, from, to).map((line) => autoAlignLine(line, preferences.autoAlignSymbols));
  const content = lines.length ? lines.join(" \\\\\n") : "& ";
  const body = `$$\n\\begin{${environment}}\n${content}\n\\end{${environment}}\n$$`;
  const insertion = blockInsertion(source, from, to, body);
  return {
    changes: { from: insertion.from, to: insertion.to, insert: insertion.insert },
    anchor: from + insertion.bodyOffset + `$$\n\\begin{${environment}}\n`.length + (lines.length ? content.length : 2)
  } satisfies LatexEditorShortcutResult;
}

export function latexCasesShortcut(source: string, from: number, to: number, preferences: LatexPreferenceValues) {
  if (!preferences.casesShortcut || isInsideMarkdownCode(source, from)) return null;
  const lines = selectedLinesForBlock(source, from, to);
  const content = lines.length ? lines.join(" \\\\\n") : " & ";
  const body = `$$\n\\begin{cases}\n${content}\n\\end{cases}\n$$`;
  const insertion = blockInsertion(source, from, to, body);
  return {
    changes: { from: insertion.from, to: insertion.to, insert: insertion.insert },
    anchor: from + insertion.bodyOffset + "$$\n\\begin{cases}\n".length + (lines.length ? content.length : 1)
  } satisfies LatexEditorShortcutResult;
}

export function latexMatrixShortcut(source: string, from: number, to: number, preferences: LatexPreferenceValues) {
  if (!preferences.matrixShortcut || isInsideMarkdownCode(source, from)) return null;
  const environment = cleanEnvironmentName(preferences.matrixEnvironment, DEFAULT_LATEX_PREFERENCES.matrixEnvironment);
  const selected = selectionText(source, from, to).trim();
  const content = selected || " ";
  const body = `$$\n\\begin{${environment}}\n${content}\n\\end{${environment}}\n$$`;
  const insertion = blockInsertion(source, from, to, body);
  return {
    changes: { from: insertion.from, to: insertion.to, insert: insertion.insert },
    anchor: from + insertion.bodyOffset + `$$\n\\begin{${environment}}\n`.length + (selected ? content.length : 0)
  } satisfies LatexEditorShortcutResult;
}

function currentLatexEnvironment(source: string, cursor: number) {
  const range = latexRangeAt(source, cursor);
  if (!range) return null;

  const before = source.slice(range.from, cursor);
  const after = source.slice(cursor, range.to);
  const beginMatches = [...before.matchAll(/\\begin\{([A-Za-z][A-Za-z*]*)\}/g)];
  const lastBegin = beginMatches.at(-1)?.[1] ?? null;
  if (!lastBegin) return null;
  if (!after.includes(`\\end{${lastBegin}}`)) return null;
  return lastBegin;
}

export function latexShiftEnterShortcut(source: string, cursor: number, preferences: LatexPreferenceValues) {
  if (!preferences.shiftEnterLineBreaks) return null;
  const environment = currentLatexEnvironment(source, cursor);
  if (!environment) return null;

  const insert = /align/.test(environment) ? " \\\\\n& " : environment === "cases" ? " \\\\\n" : null;
  if (!insert) return null;

  return {
    changes: { from: cursor, to: cursor, insert },
    anchor: cursor + insert.length
  } satisfies LatexEditorShortcutResult;
}

export function latexKeyboardShortcut(
  source: string,
  from: number,
  to: number,
  event: KeyboardShortcutEvent,
  preferences: LatexPreferenceValues
) {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod || event.altKey) return null;
  const key = event.key.toLowerCase();

  if (key === "m") {
    return event.shiftKey
      ? latexDisplayMathShortcut(source, from, to, preferences)
      : latexInlineMathShortcut(source, from, to, preferences);
  }

  if (!event.shiftKey) return null;
  if (key === "a") return latexAlignShortcut(source, from, to, preferences);
  if (key === "c") return latexCasesShortcut(source, from, to, preferences);
  if (key === "x") return latexMatrixShortcut(source, from, to, preferences);

  return null;
}
