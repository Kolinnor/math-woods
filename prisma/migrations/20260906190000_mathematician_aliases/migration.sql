-- Keep existing names, translations and slugs intact. Differences between names
-- are not automatically promoted to aliases: they may be editorial mistakes.
ALTER TABLE "Mathematician" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
