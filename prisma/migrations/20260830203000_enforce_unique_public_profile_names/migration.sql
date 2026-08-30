ALTER TABLE "User"
ADD COLUMN "displayNameUniquenessExempt" BOOLEAN NOT NULL DEFAULT false;

DO $$
DECLARE
  target_user_id INTEGER;
  owner_user_id INTEGER;
  old_display_name TEXT;
BEGIN
  IF (
    SELECT COUNT(*)
    FROM "User"
    WHERE "displayName" = 'baobab' AND "deletedAt" IS NULL
  ) > 1 THEN
    RAISE EXCEPTION 'Cannot rename baobab automatically: more than one exact active match exists.';
  END IF;

  SELECT "id", "displayName"
  INTO target_user_id, old_display_name
  FROM "User"
  WHERE "displayName" = 'baobab' AND "deletedAt" IS NULL
  LIMIT 1;

  IF target_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM "User"
      WHERE "id" <> target_user_id
        AND "deletedAt" IS NULL
        AND LOWER("displayName") = LOWER('araucaria araucana')
    ) THEN
      RAISE EXCEPTION 'Cannot rename baobab: araucaria araucana is already in use.';
    END IF;

    SELECT "id"
    INTO owner_user_id
    FROM "User"
    WHERE "role" = 'OWNER' AND "deletedAt" IS NULL
    ORDER BY "id"
    LIMIT 1;

    UPDATE "User"
    SET
      "displayName" = 'araucaria araucana',
      "displayNameChangedAt" = CURRENT_TIMESTAMP
    WHERE "id" = target_user_id;

    INSERT INTO "DisplayNameChange" (
      "userId",
      "actorId",
      "oldDisplayName",
      "newDisplayName",
      "changedAt"
    ) VALUES (
      target_user_id,
      COALESCE(owner_user_id, target_user_id),
      old_display_name,
      'araucaria araucana',
      CURRENT_TIMESTAMP
    );
  END IF;
END
$$;

WITH ranked_names AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY LOWER("displayName")
      ORDER BY "createdAt", "id"
    ) AS name_position
  FROM "User"
  WHERE "displayName" IS NOT NULL AND "deletedAt" IS NULL
)
UPDATE "User" AS target
SET "displayNameUniquenessExempt" = true
FROM ranked_names
WHERE target."id" = ranked_names."id"
  AND ranked_names.name_position > 1;

CREATE UNIQUE INDEX "User_active_displayName_lower_key"
ON "User" (LOWER("displayName"))
WHERE "displayName" IS NOT NULL
  AND "deletedAt" IS NULL
  AND "displayNameUniquenessExempt" = false;
