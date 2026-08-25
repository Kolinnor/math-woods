CREATE TYPE "ProblemRecommendationDismissalReason" AS ENUM (
  'TOO_HARD',
  'TOO_EASY',
  'LESS_LIKE_THIS',
  'ALREADY_KNOWN',
  'NOT_INTERESTED_IN_DOMAIN'
);

ALTER TABLE "ProblemRecommendationExposure"
ADD COLUMN "dismissedAt" TIMESTAMP(3),
ADD COLUMN "dismissalReason" "ProblemRecommendationDismissalReason";
