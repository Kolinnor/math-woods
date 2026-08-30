ALTER TABLE "Problem" ADD COLUMN "editorialDifficulty" INTEGER;

UPDATE "Problem"
SET "editorialDifficulty" = "difficulty"
WHERE "editorialDifficulty" IS NULL;

ALTER TABLE "ProblemProof" ADD COLUMN "language" TEXT;

UPDATE "ProblemProof" AS proof
SET "language" = problem."language"
FROM "Problem" AS problem
WHERE proof."problemId" = problem."id";

UPDATE "ProblemProof"
SET "language" = 'fr'
WHERE "bodyMarkdown" ~* E'(^|[^[:alpha:]])(avec|pour|une|dans|donc|soit|alors|cette|démontr|montrons)([^[:alpha:]]|$)'
   OR "bodyMarkdown" ~ '[àâçéèêëîïôùûüÿœæ]';

UPDATE "ProblemProof"
SET "language" = 'en'
WHERE "bodyMarkdown" ~* E'(^|[^[:alpha:]])(the|with|let|therefore|hence|suppose|assume|show|proof)([^[:alpha:]]|$)'
  AND "bodyMarkdown" !~ '[àâçéèêëîïôùûüÿœæ]';

ALTER TABLE "ProblemProof" ALTER COLUMN "language" SET DEFAULT 'en';
ALTER TABLE "ProblemProof" ALTER COLUMN "language" SET NOT NULL;

ALTER TABLE "ProofComment" ADD COLUMN "language" TEXT;

UPDATE "ProofComment" AS comment
SET "language" = proof."language"
FROM "ProblemProof" AS proof
WHERE comment."proofId" = proof."id";

UPDATE "ProofComment"
SET "language" = 'fr'
WHERE "bodyMarkdown" ~* E'(^|[^[:alpha:]])(avec|pour|une|dans|donc|soit|alors|cette|démontr|montrons)([^[:alpha:]]|$)'
   OR "bodyMarkdown" ~ '[àâçéèêëîïôùûüÿœæ]';

UPDATE "ProofComment"
SET "language" = 'en'
WHERE "bodyMarkdown" ~* E'(^|[^[:alpha:]])(the|with|let|therefore|hence|suppose|assume|show|proof)([^[:alpha:]]|$)'
  AND "bodyMarkdown" !~ '[àâçéèêëîïôùûüÿœæ]';

ALTER TABLE "ProofComment" ALTER COLUMN "language" SET DEFAULT 'en';
ALTER TABLE "ProofComment" ALTER COLUMN "language" SET NOT NULL;

CREATE TABLE "ProblemDifficultyVote" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "translationGroupId" TEXT NOT NULL,
  "value" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProblemDifficultyVote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProblemDifficultyVote_value_check" CHECK ("value" BETWEEN 1 AND 100)
);

CREATE UNIQUE INDEX "ProblemDifficultyVote_userId_translationGroupId_key"
ON "ProblemDifficultyVote"("userId", "translationGroupId");

CREATE INDEX "ProblemDifficultyVote_translationGroupId_idx"
ON "ProblemDifficultyVote"("translationGroupId");

ALTER TABLE "ProblemDifficultyVote"
ADD CONSTRAINT "ProblemDifficultyVote_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
