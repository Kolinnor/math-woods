DO $$
DECLARE
  target_user_id INTEGER;
  target_count INTEGER;
BEGIN
  SELECT COUNT(*), MIN("id")
  INTO target_count, target_user_id
  FROM "User"
  WHERE "deletedAt" IS NULL
    AND LOWER(COALESCE("displayName", '')) = LOWER('araucaria araucana')
    AND (
      LOWER("profileSlug") = 'baobab'
      OR LOWER("username") = 'baobab'
    );

  IF target_count = 0 THEN
    RETURN;
  END IF;

  IF target_count > 1 THEN
    RAISE EXCEPTION 'Cannot update araucaria profile slug: several matching active users exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "id" <> target_user_id
      AND LOWER("profileSlug") = 'araucaria-araucana'
  ) THEN
    RAISE EXCEPTION 'Cannot update araucaria profile slug: araucaria-araucana is already in use.';
  END IF;

  UPDATE "User"
  SET "profileSlug" = 'araucaria-araucana'
  WHERE "id" = target_user_id;
END
$$;
