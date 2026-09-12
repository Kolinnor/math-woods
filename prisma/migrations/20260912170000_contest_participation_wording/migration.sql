-- Update the former default wording while preserving any other rule edits.
UPDATE "ProblemContest"
SET "rulesFr" = REPLACE(
  REPLACE("rulesFr", 'Une proposition par personne.', 'Un seul problème par personne.'),
  'comptent comme une seule proposition.', 'comptent comme une seule participation.'
)
WHERE "rulesFr" LIKE '%Une proposition par personne.%'
   OR "rulesFr" LIKE '%comptent comme une seule proposition.%';
