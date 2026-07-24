DO $$
DECLARE
  organization_section_id INTEGER;
BEGIN
  SELECT "id"
  INTO organization_section_id
  FROM "FaqSection"
  WHERE "title" IN ('Organization', 'Mission and funding')
  ORDER BY
    CASE WHEN "title" = 'Organization' THEN 0 ELSE 1 END,
    "position" ASC,
    "id" ASC
  LIMIT 1;

  IF organization_section_id IS NOT NULL THEN
    UPDATE "FaqSection"
    SET "title" = 'Organization',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = organization_section_id
      AND "title" = 'Mission and funding';
  END IF;

  IF organization_section_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "FaqItem"
    WHERE "sectionId" = organization_section_id
      AND "question" = 'Will the site remain forever free, without any kind of subscription or ads ?'
  ) THEN
    UPDATE "FaqItem"
    SET "position" = "position" + 1
    WHERE "sectionId" = organization_section_id;

    INSERT INTO "FaqItem" ("sectionId", "position", "question", "answerMarkdown", "createdAt", "updatedAt")
    VALUES (
      organization_section_id,
      0,
      'Will the site remain forever free, without any kind of subscription or ads ?',
      'Yes.',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
