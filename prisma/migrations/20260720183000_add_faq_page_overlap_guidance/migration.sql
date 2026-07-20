DO $$
DECLARE
  creating_problems_section_id INTEGER;
BEGIN
  SELECT "id"
  INTO creating_problems_section_id
  FROM "FaqSection"
  WHERE "anchorId" = 'creating-problems'
  ORDER BY "position" ASC, "id" ASC
  LIMIT 1;

  IF creating_problems_section_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "FaqItem"
    WHERE "sectionId" = creating_problems_section_id
      AND "question" = 'Is it a problem if some pages overlap?'
  ) THEN
    UPDATE "FaqItem"
    SET "position" = "position" + 1
    WHERE "sectionId" = creating_problems_section_id
      AND "position" >= 3;

    INSERT INTO "FaqItem" ("sectionId", "position", "question", "answerMarkdown", "createdAt", "updatedAt")
    VALUES (
      creating_problems_section_id,
      3,
      'Is it a problem if some pages overlap?',
      'No. A little repetition is fine. Mathematics cannot be divided perfectly into one exact page for every problem or concept: formulations, audiences, and useful levels of detail naturally overlap. Search first and avoid exact duplicates, but do not let partial overlap stop you from creating a useful page. Related pages can be linked, clarified, or merged later.',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
