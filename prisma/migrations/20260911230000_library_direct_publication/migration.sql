-- Submitted entries become visible without waiting for a review.
-- Drafts, requested changes and archives remain untouched.
UPDATE "Mathematician"
SET "status" = 'PUBLISHED', "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP),
    "needsReviewAfterEdit" = true, "reviewedAt" = NULL, "reviewedById" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING_REVIEW';

UPDATE "LibraryReference"
SET "status" = 'PUBLISHED', "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP),
    "reviewedAt" = NULL, "reviewedById" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING_REVIEW';

UPDATE "HistoryMilestone"
SET "status" = 'PUBLISHED', "publishedAt" = COALESCE("publishedAt", CURRENT_TIMESTAMP),
    "reviewedAt" = NULL, "reviewedById" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING_REVIEW';
