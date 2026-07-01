ALTER TABLE "LatexPreference"
  ADD COLUMN "markdownHeadingShortcuts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "markdownHeading1Shortcut" TEXT NOT NULL DEFAULT 'Shift+1',
  ADD COLUMN "markdownHeading2Shortcut" TEXT NOT NULL DEFAULT 'Shift+2',
  ADD COLUMN "markdownHeading3Shortcut" TEXT NOT NULL DEFAULT 'Shift+3',
  ADD COLUMN "markdownHeading4Shortcut" TEXT NOT NULL DEFAULT 'Shift+4',
  ADD COLUMN "markdownHeading5Shortcut" TEXT NOT NULL DEFAULT 'Shift+5',
  ADD COLUMN "markdownHeading6Shortcut" TEXT NOT NULL DEFAULT 'Shift+6';
