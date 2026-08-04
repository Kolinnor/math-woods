DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER("username")
    FROM "User"
    GROUP BY LOWER("username")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce case-insensitive username uniqueness: conflicting usernames exist.';
  END IF;
END
$$;

CREATE UNIQUE INDEX "User_username_lower_key" ON "User" (LOWER("username"));
