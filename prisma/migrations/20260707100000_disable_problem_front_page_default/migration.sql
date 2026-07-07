ALTER TABLE "Problem" ALTER COLUMN "canAppearOnFrontPage" SET DEFAULT false;

UPDATE "Problem" SET "canAppearOnFrontPage" = false;
