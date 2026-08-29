ALTER TABLE "Notification"
ADD COLUMN "aggregationKey" TEXT;

CREATE UNIQUE INDEX "Notification_userId_type_aggregationKey_key"
ON "Notification"("userId", "type", "aggregationKey");

-- Replace the former one-notification-per-account history with the new summary.
DELETE FROM "Notification"
WHERE "type" = 'USER_REGISTERED';
