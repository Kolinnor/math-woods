ALTER TABLE "User" ADD COLUMN "profileSlug" TEXT;

WITH normalized AS (
  SELECT
    "id",
    "username",
    LEFT(
      TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(COALESCE(NULLIF("displayName", ''), "username")), '[^a-z0-9]+', '-', 'g')),
      80
    ) AS candidate
  FROM "User"
), candidates AS (
  SELECT
    normalized.*,
    COUNT(*) OVER (PARTITION BY "candidate") AS candidate_count
  FROM normalized
)
UPDATE "User" AS target
SET "profileSlug" = CASE
  WHEN LENGTH(candidates."candidate") >= 2
    AND candidates.candidate_count = 1
    AND NOT EXISTS (
      SELECT 1
      FROM "User" AS conflicting_user
      WHERE conflicting_user."id" <> candidates."id"
        AND LOWER(conflicting_user."username") = candidates."candidate"
    )
  THEN candidates."candidate"
  ELSE 'profile-' || SUBSTRING(MD5(candidates."username" || ':' || candidates."id"::TEXT), 1, 16)
END
FROM candidates
WHERE target."id" = candidates."id";

ALTER TABLE "User" ALTER COLUMN "profileSlug" SET NOT NULL;

CREATE UNIQUE INDEX "User_profileSlug_key" ON "User"("profileSlug");
CREATE UNIQUE INDEX "User_profileSlug_lower_key" ON "User"(LOWER("profileSlug"));
