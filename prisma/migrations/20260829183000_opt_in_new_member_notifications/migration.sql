INSERT INTO "NotificationPreference" ("userId", "type", "enabled", "updatedAt")
SELECT
  "id",
  'USER_REGISTERED'::"NotificationType",
  CASE WHEN "role" = 'OWNER'::"Role" THEN TRUE ELSE FALSE END,
  CURRENT_TIMESTAMP
FROM "User"
ON CONFLICT ("userId", "type") DO UPDATE
SET
  "enabled" = EXCLUDED."enabled",
  "updatedAt" = EXCLUDED."updatedAt";
