ALTER TABLE "User" ADD COLUMN "displayName" TEXT;

UPDATE "User"
SET "displayName" = regexp_replace(initcap(replace("username", '-', ' ')), '[[:space:]]+', ' ', 'g')
WHERE "displayName" IS NULL;
