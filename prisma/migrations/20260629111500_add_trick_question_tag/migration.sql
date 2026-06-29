INSERT INTO "Tag" ("slug", "name", "description")
VALUES (
  'trick-question',
  'Trick question',
  'A spoiler tag for problems whose main difficulty is noticing a trap in the wording.'
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description";
