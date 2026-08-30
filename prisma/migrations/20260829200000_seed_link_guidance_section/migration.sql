-- Adds the "Link generously" section to installs whose contribution page was
-- already seeded. ensureEditableContributionPage() only seeds when the section
-- table is empty, so a new default would never reach an existing deployment.
-- Idempotent: does nothing when the table is empty (defaults already cover it)
-- or when a section with this title is present.
INSERT INTO "ContributionPageSection" ("position", "title", "bodyMarkdown", "createdAt", "updatedAt")
SELECT COALESCE(MAX("position"), 0) + 1,
       'Link generously',
       'Write `[[Concept]]` to link a concept, or `[[Concept|visible text]]` when the sentence needs different wording: the target before `|` is what keeps every language connected to the same idea. Problems use ordinary Markdown links to `/problems/slug`. Linking to a page that does not exist yet is useful, not a mistake: the link leads to a missing concept that the concept browser lists, and every link you write appears as a backlink on the other side.',
       NOW(),
       NOW()
FROM "ContributionPageSection"
HAVING COUNT(*) > 0
   AND NOT EXISTS (
     SELECT 1 FROM "ContributionPageSection" WHERE "title" = 'Link generously'
   );
