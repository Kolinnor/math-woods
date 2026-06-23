INSERT INTO "ProblemFavorite" ("userId", "problemId", "createdAt")
SELECT "authorId", "id", "createdAt"
FROM "Problem"
ON CONFLICT ("userId", "problemId") DO NOTHING;
