export type MarkdownFoldBlock = {
  body: string;
  title: string;
  token: string;
};

type Fence = {
  character: "`" | "~";
  length: number;
};

const FOLD_OPEN = /^ {0,3}:::fold[\t ]+(.+?)[\t ]*$/;
const FOLD_CLOSE = /^ {0,3}:::[\t ]*$/;

export const DEFAULT_MARKDOWN_FOLD_TITLE = "Section title";

export function markdownFoldBlock(body: string, title = DEFAULT_MARKDOWN_FOLD_TITLE) {
  return `:::fold ${title}\n${body}\n:::`;
}

function openingFence(line: string): Fence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  return {
    character: match[1][0] as Fence["character"],
    length: match[1].length
  };
}

function closesFence(line: string, fence: Fence) {
  const pattern = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[\\t ]*$`);
  return pattern.test(line);
}

function foldToken(markdownLength: number, index: number) {
  return `@@MATHWOODSFOLD${markdownLength}TOKEN${index}@@`;
}

export function extractMarkdownFolds(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  const folds: MarkdownFoldBlock[] = [];
  let fence: Fence | null = null;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];

    if (fence) {
      output.push(line);
      if (closesFence(line, fence)) fence = null;
      index += 1;
      continue;
    }

    const nextFence = openingFence(line);
    if (nextFence) {
      fence = nextFence;
      output.push(line);
      index += 1;
      continue;
    }

    const opening = line.match(FOLD_OPEN);
    if (!opening) {
      output.push(line);
      index += 1;
      continue;
    }

    let closingIndex = -1;
    let bodyFence: Fence | null = null;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const bodyLine = lines[cursor];
      if (bodyFence) {
        if (closesFence(bodyLine, bodyFence)) bodyFence = null;
        continue;
      }
      const nextBodyFence = openingFence(bodyLine);
      if (nextBodyFence) {
        bodyFence = nextBodyFence;
        continue;
      }
      if (FOLD_CLOSE.test(bodyLine)) {
        closingIndex = cursor;
        break;
      }
    }

    if (closingIndex === -1) {
      output.push(line);
      index += 1;
      continue;
    }

    const token = foldToken(markdown.length, folds.length);
    folds.push({
      body: lines.slice(index + 1, closingIndex).join("\n"),
      title: opening[1].trim(),
      token
    });
    output.push("", token, "");
    index = closingIndex + 1;
  }

  return {
    folds,
    markdown: output.join("\n")
  };
}
