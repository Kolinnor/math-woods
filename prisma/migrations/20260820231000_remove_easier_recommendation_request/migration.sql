DELETE FROM "RecommendationEvent"
WHERE "eventType" = 'EASIER_REQUESTED';

ALTER TYPE "RecommendationEventType" RENAME TO "RecommendationEventType_old";

CREATE TYPE "RecommendationEventType" AS ENUM (
  'OPENED',
  'STARTED',
  'SOLVED',
  'BLOCKED',
  'TOO_HARD',
  'TOO_EASY'
);

ALTER TABLE "RecommendationEvent"
ALTER COLUMN "eventType" TYPE "RecommendationEventType"
USING ("eventType"::text::"RecommendationEventType");

DROP TYPE "RecommendationEventType_old";
