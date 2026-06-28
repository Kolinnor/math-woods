import type { LatexRange } from "./latex-ranges.ts";

export type LatexSyntaxTokenKind =
  | "delimiter"
  | "command"
  | "bracket"
  | "number"
  | "operator"
  | "identifier";

export type LatexSyntaxToken = {
  from: number;
  to: number;
  kind: LatexSyntaxTokenKind;
};

function openingDelimiterLength(text: string, from: number) {
  return text.startsWith("$$", from) || text.startsWith("\\(", from) || text.startsWith("\\[", from) ? 2 : 1;
}

function closingDelimiterLength(text: string, to: number) {
  return text.slice(Math.max(0, to - 2), to) === "$$" ||
    text.slice(Math.max(0, to - 2), to) === "\\)" ||
    text.slice(Math.max(0, to - 2), to) === "\\]"
    ? 2
    : 1;
}

function token(from: number, to: number, kind: LatexSyntaxTokenKind): LatexSyntaxToken {
  return { from, to, kind };
}

export function findLatexSyntaxTokens(text: string, range: LatexRange): LatexSyntaxToken[] {
  const tokens: LatexSyntaxToken[] = [];
  const openLength = openingDelimiterLength(text, range.from);
  const closeLength = closingDelimiterLength(text, range.to);
  const contentFrom = range.from + openLength;
  const contentTo = range.to - closeLength;
  let position = contentFrom;

  tokens.push(token(range.from, contentFrom, "delimiter"));
  tokens.push(token(contentTo, range.to, "delimiter"));

  while (position < contentTo) {
    const char = text[position];

    if (/\s/.test(char)) {
      position += 1;
      continue;
    }

    if (char === "\\") {
      const commandMatch = text.slice(position, contentTo).match(/^\\[A-Za-z]+|^\\./);
      const length = commandMatch?.[0]?.length ?? 1;
      tokens.push(token(position, Math.min(contentTo, position + length), "command"));
      position += length;
      continue;
    }

    if (/[\{\}\[\]\(\)]/.test(char)) {
      tokens.push(token(position, position + 1, "bracket"));
      position += 1;
      continue;
    }

    const numberMatch = text.slice(position, contentTo).match(/^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push(token(position, position + numberMatch[0].length, "number"));
      position += numberMatch[0].length;
      continue;
    }

    if (/[+\-=<>*/^_&|,;:!.]/.test(char)) {
      tokens.push(token(position, position + 1, "operator"));
      position += 1;
      continue;
    }

    const identifierMatch = text.slice(position, contentTo).match(/^[A-Za-z]+/);
    if (identifierMatch) {
      tokens.push(token(position, position + identifierMatch[0].length, "identifier"));
      position += identifierMatch[0].length;
      continue;
    }

    position += 1;
  }

  return tokens.filter((item) => item.from < item.to);
}
