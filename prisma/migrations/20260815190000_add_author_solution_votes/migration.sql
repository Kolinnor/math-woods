INSERT INTO "Vote" ("userId", "targetType", "targetId", "voteType", "createdAt")
SELECT
  proof."authorId",
  'PROOF'::"TargetType",
  proof."id",
  'UP'::"VoteType",
  CURRENT_TIMESTAMP
FROM "ProblemProof" AS proof
ON CONFLICT ("userId", "targetType", "targetId") DO UPDATE
SET "voteType" = 'UP'::"VoteType";
