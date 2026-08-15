ALTER TABLE "User"
  ADD COLUMN "discoverySource" TEXT,
  ADD COLUMN "discoverySourceDetail" TEXT;

INSERT INTO "AchievementUnlock" ("userId", "key", "title", "description", "unlockedAt")
SELECT
  "id",
  'a-place-in-the-woods',
  'A Place in the Woods',
  'Complete your profile bio.',
  CURRENT_TIMESTAMP
FROM "User"
WHERE NULLIF(BTRIM("bio"), '') IS NOT NULL
ON CONFLICT ("userId", "key") DO NOTHING;
