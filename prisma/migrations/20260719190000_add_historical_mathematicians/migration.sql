CREATE TABLE IF NOT EXISTS "Mathematician" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lifespan" TEXT NOT NULL DEFAULT 'Unknown',
  "birthPlace" TEXT NOT NULL DEFAULT 'Unknown',
  "portraitUrl" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Mathematician_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Mathematician"
  ADD COLUMN IF NOT EXISTS "lifespan" TEXT NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS "birthPlace" TEXT NOT NULL DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS "portraitUrl" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Mathematician' AND column_name = 'birthYear'
  ) THEN
    EXECUTE 'UPDATE "Mathematician"
      SET "lifespan" = CASE
        WHEN "birthYear" IS NULL AND "deathYear" IS NULL THEN "lifespan"
        ELSE concat_ws(''-'', "birthYear"::text, "deathYear"::text)
      END';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Mathematician' AND column_name = 'nationality'
  ) THEN
    EXECUTE 'UPDATE "Mathematician"
      SET "birthPlace" = COALESCE(NULLIF("nationality", ''''), "birthPlace")';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Mathematician' AND column_name = 'photoUrl'
  ) THEN
    EXECUTE 'UPDATE "Mathematician"
      SET "portraitUrl" = COALESCE("photoUrl", "portraitUrl")';
  END IF;
END $$;

ALTER TABLE "Mathematician"
  ALTER COLUMN "lifespan" DROP DEFAULT,
  ALTER COLUMN "birthPlace" DROP DEFAULT,
  DROP COLUMN IF EXISTS "birthYear",
  DROP COLUMN IF EXISTS "deathYear",
  DROP COLUMN IF EXISTS "nationality",
  DROP COLUMN IF EXISTS "photoUrl",
  DROP COLUMN IF EXISTS "summaryMarkdown",
  DROP COLUMN IF EXISTS "summaryHtml",
  DROP COLUMN IF EXISTS "bodyMarkdown",
  DROP COLUMN IF EXISTS "bodyHtml";

CREATE UNIQUE INDEX IF NOT EXISTS "Mathematician_slug_key" ON "Mathematician"("slug");
CREATE INDEX IF NOT EXISTS "Mathematician_name_idx" ON "Mathematician"("name");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Mathematician_createdById_fkey'
  ) THEN
    ALTER TABLE "Mathematician"
      ADD CONSTRAINT "Mathematician_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "Mathematician" ("slug", "name", "lifespan", "birthPlace", "portraitUrl") VALUES
  ('leonhard-euler', 'Leonhard Euler', '1707-1783', 'Basel, Switzerland', '/mathematicians/leonhard-euler.jpg'),
  ('carl-friedrich-gauss', 'Carl Friedrich Gauss', '1777-1855', 'Brunswick, Germany', '/mathematicians/carl-friedrich-gauss.jpg'),
  ('bernhard-riemann', 'Bernhard Riemann', '1826-1866', 'Breselenz, Kingdom of Hanover', '/mathematicians/bernhard-riemann.jpg'),
  ('sofia-kovalevskaya', 'Sofia Kovalevskaya', '1850-1891', 'Moscow, Russian Empire', '/mathematicians/sofia-kovalevskaya.jpg'),
  ('emmy-noether', 'Emmy Noether', '1882-1935', 'Erlangen, Germany', '/mathematicians/emmy-noether.jpg'),
  ('srinivasa-ramanujan', 'Srinivasa Ramanujan', '1887-1920', 'Erode, India', '/mathematicians/srinivasa-ramanujan.jpg')
ON CONFLICT ("slug") DO NOTHING;
