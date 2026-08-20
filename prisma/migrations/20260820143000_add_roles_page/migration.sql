CREATE TABLE "RolesPageContent" (
  "id" INTEGER NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RolesPageContent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "RolesPageContent" ("id", "bodyMarkdown", "createdAt", "updatedAt")
VALUES (1, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

WITH target_section AS (
  SELECT "id"
  FROM "FaqSection"
  WHERE "title" = 'Community and governance'
  ORDER BY "position", "id"
  LIMIT 1
), next_position AS (
  SELECT
    target_section."id" AS "sectionId",
    COALESCE(MAX("FaqItem"."position"), -1) + 1 AS "position"
  FROM target_section
  LEFT JOIN "FaqItem" ON "FaqItem"."sectionId" = target_section."id"
  GROUP BY target_section."id"
)
INSERT INTO "FaqItem" (
  "sectionId",
  "position",
  "question",
  "answerMarkdown",
  "createdAt",
  "updatedAt"
)
SELECT
  next_position."sectionId",
  next_position."position",
  'What are the different roles on Math Woods?',
  'You can find an overview on the [Roles page](/roles).',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM next_position
WHERE NOT EXISTS (
  SELECT 1
  FROM "FaqItem"
  WHERE "FaqItem"."sectionId" = next_position."sectionId"
    AND "FaqItem"."answerMarkdown" LIKE '%](/roles)%'
);
