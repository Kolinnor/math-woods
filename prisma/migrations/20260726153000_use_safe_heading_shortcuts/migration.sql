ALTER TABLE "LatexPreference"
  ALTER COLUMN "markdownHeading1Shortcut" SET DEFAULT 'Ctrl+1',
  ALTER COLUMN "markdownHeading2Shortcut" SET DEFAULT 'Ctrl+2',
  ALTER COLUMN "markdownHeading3Shortcut" SET DEFAULT 'Ctrl+3',
  ALTER COLUMN "markdownHeading4Shortcut" SET DEFAULT 'Ctrl+4',
  ALTER COLUMN "markdownHeading5Shortcut" SET DEFAULT 'Ctrl+5',
  ALTER COLUMN "markdownHeading6Shortcut" SET DEFAULT 'Ctrl+6';

UPDATE "LatexPreference"
SET
  "markdownHeading1Shortcut" = CASE
    WHEN "markdownHeading1Shortcut" = 'Shift+1' THEN 'Ctrl+1'
    ELSE "markdownHeading1Shortcut"
  END,
  "markdownHeading2Shortcut" = CASE
    WHEN "markdownHeading2Shortcut" = 'Shift+2' THEN 'Ctrl+2'
    ELSE "markdownHeading2Shortcut"
  END,
  "markdownHeading3Shortcut" = CASE
    WHEN "markdownHeading3Shortcut" = 'Shift+3' THEN 'Ctrl+3'
    ELSE "markdownHeading3Shortcut"
  END,
  "markdownHeading4Shortcut" = CASE
    WHEN "markdownHeading4Shortcut" = 'Shift+4' THEN 'Ctrl+4'
    ELSE "markdownHeading4Shortcut"
  END,
  "markdownHeading5Shortcut" = CASE
    WHEN "markdownHeading5Shortcut" = 'Shift+5' THEN 'Ctrl+5'
    ELSE "markdownHeading5Shortcut"
  END,
  "markdownHeading6Shortcut" = CASE
    WHEN "markdownHeading6Shortcut" = 'Shift+6' THEN 'Ctrl+6'
    ELSE "markdownHeading6Shortcut"
  END
WHERE
  "markdownHeading1Shortcut" = 'Shift+1'
  OR "markdownHeading2Shortcut" = 'Shift+2'
  OR "markdownHeading3Shortcut" = 'Shift+3'
  OR "markdownHeading4Shortcut" = 'Shift+4'
  OR "markdownHeading5Shortcut" = 'Shift+5'
  OR "markdownHeading6Shortcut" = 'Shift+6';
