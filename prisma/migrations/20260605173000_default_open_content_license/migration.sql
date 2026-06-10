UPDATE "Problem"
SET "license" = 'CC BY-SA 4.0'
WHERE "license" IS NULL OR trim("license") = '' OR "license" = 'CC BY-SA';

ALTER TABLE "Problem"
ALTER COLUMN "license" SET DEFAULT 'CC BY-SA 4.0',
ALTER COLUMN "license" SET NOT NULL;
