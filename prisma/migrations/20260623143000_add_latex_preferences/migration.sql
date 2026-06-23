CREATE TABLE "LatexPreference" (
  "userId" INTEGER NOT NULL,
  "autocloseDollars" BOOLEAN NOT NULL DEFAULT true,
  "mathShortcuts" BOOLEAN NOT NULL DEFAULT true,
  "moveCursorBetweenDollars" BOOLEAN NOT NULL DEFAULT true,
  "encloseSelectionDollars" BOOLEAN NOT NULL DEFAULT true,
  "autocloseCurlyBrackets" BOOLEAN NOT NULL DEFAULT false,
  "autocloseSquareBrackets" BOOLEAN NOT NULL DEFAULT false,
  "autocloseRoundBrackets" BOOLEAN NOT NULL DEFAULT false,
  "appendSumLimits" BOOLEAN NOT NULL DEFAULT true,
  "autoEnlargeBrackets" BOOLEAN NOT NULL DEFAULT true,
  "superscriptBraces" BOOLEAN NOT NULL DEFAULT true,
  "subscriptBraces" BOOLEAN NOT NULL DEFAULT true,
  "slashFractions" BOOLEAN NOT NULL DEFAULT false,
  "alignShortcut" BOOLEAN NOT NULL DEFAULT true,
  "alignEnvironment" TEXT NOT NULL DEFAULT 'align*',
  "autoAlignSymbols" TEXT NOT NULL DEFAULT '= > < \le \ge \neq \approx',
  "casesShortcut" BOOLEAN NOT NULL DEFAULT true,
  "shiftEnterLineBreaks" BOOLEAN NOT NULL DEFAULT false,
  "matrixShortcut" BOOLEAN NOT NULL DEFAULT true,
  "matrixEnvironment" TEXT NOT NULL DEFAULT 'pmatrix',
  "greekMathMode" BOOLEAN NOT NULL DEFAULT true,
  "customShorthand" BOOLEAN NOT NULL DEFAULT true,
  "tabCompletesShorthand" BOOLEAN NOT NULL DEFAULT false,
  "customCommands" TEXT NOT NULL DEFAULT '% One shortcut per line: trigger => replacement
RR => \mathbb{R}
NN => \mathbb{N}
ZZ => \mathbb{Z}
QQ => \mathbb{Q}
CC => \mathbb{C}
eps => \varepsilon
inn => \in
notin => \notin
implies => \Rightarrow
iff => \Longleftrightarrow',
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LatexPreference_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "LatexPreference"
  ADD CONSTRAINT "LatexPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
