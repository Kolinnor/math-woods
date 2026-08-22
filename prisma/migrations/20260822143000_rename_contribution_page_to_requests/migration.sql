UPDATE "ContributionPageContent"
SET "title" = 'Requests'
WHERE "id" = 1 AND "title" = 'Contribution';

DELETE FROM "ContributionPageSection"
WHERE "title" = 'Do not wait for perfection.'
  AND BTRIM("bodyMarkdown") = 'A clean problem, a stub concept, a source note, a partial solution, or a correction request can already help.';
