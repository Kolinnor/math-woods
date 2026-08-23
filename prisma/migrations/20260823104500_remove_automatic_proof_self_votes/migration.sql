DELETE FROM "Vote" AS vote
USING "ProblemProof" AS proof
WHERE vote."targetType" = 'PROOF'::"TargetType"
  AND vote."targetId" = proof."id"
  AND (
    vote."userId" = proof."authorId"
    OR vote."userId" = proof."translatedById"
  );
