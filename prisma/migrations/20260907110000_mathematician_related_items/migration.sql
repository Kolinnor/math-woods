CREATE TABLE "MathematicianRelatedItem" (
  "id" SERIAL PRIMARY KEY,
  "translationId" INTEGER NOT NULL REFERENCES "MathematicianTranslation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "key" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "labelMarkdown" TEXT NOT NULL DEFAULT '',
  "noteMarkdown" TEXT NOT NULL DEFAULT '',
  "relation" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL DEFAULT 0,
  "referenceId" INTEGER REFERENCES "LibraryReference"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "conceptId" INTEGER REFERENCES "Concept"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "problemId" INTEGER REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MathematicianRelatedItem_translationId_key_key" ON "MathematicianRelatedItem"("translationId", "key");
CREATE INDEX "MathematicianRelatedItem_referenceId_idx" ON "MathematicianRelatedItem"("referenceId");
CREATE INDEX "MathematicianRelatedItem_conceptId_idx" ON "MathematicianRelatedItem"("conceptId");
CREATE INDEX "MathematicianRelatedItem_problemId_idx" ON "MathematicianRelatedItem"("problemId");

-- The existing links had no language. Copy them to every existing translation,
-- preserving notes and order. Keep the legacy tables intact for recovery.
-- A legacy bibliography link does not prove authorship: leave its role unclassified.
-- Use the same French fallback as the original library migration for records
-- created without a translation. Preserve their legacy biography as well.
INSERT INTO "MathematicianTranslation" ("mathematicianId", "language", "displayName", "birthPlace", "biographyMarkdown", "biographyHtml", "updatedAt")
SELECT m.id, 'fr', m.name, m."birthPlace", m."contentMarkdown", m."contentHtml", CURRENT_TIMESTAMP
FROM "Mathematician" m
WHERE NOT EXISTS (SELECT 1 FROM "MathematicianTranslation" t WHERE t."mathematicianId" = m.id);

INSERT INTO "MathematicianRelatedItem" ("translationId", "key", "category", "labelMarkdown", "noteMarkdown", "position", "referenceId")
SELECT t.id, 'legacy-work-' || w.id, 'LEGACY', r."canonicalTitle", COALESCE(w.note, ''), w.position, w."referenceId"
FROM "MathematicianTranslation" t JOIN "MathematicianWork" w ON w."mathematicianId" = t."mathematicianId"
JOIN "LibraryReference" r ON r.id = w."referenceId";
INSERT INTO "MathematicianRelatedItem" ("translationId", "key", "category", "labelMarkdown", "noteMarkdown", "position", "conceptId")
SELECT t.id, 'legacy-concept-' || c.id, 'CONCEPT', c.title, COALESCE(w.note, ''), w.position, c.id
FROM "MathematicianTranslation" t JOIN "MathematicianConcept" w ON w."mathematicianId" = t."mathematicianId"
JOIN "Concept" c ON c.id = w."conceptId";
INSERT INTO "MathematicianRelatedItem" ("translationId", "key", "category", "labelMarkdown", "noteMarkdown", "position", "problemId")
SELECT t.id, 'legacy-problem-' || p.id, 'PROBLEM', p.title, COALESCE(w.note, ''), w.position, p.id
FROM "MathematicianTranslation" t JOIN "MathematicianProblem" w ON w."mathematicianId" = t."mathematicianId"
JOIN "Problem" p ON p.id = w."problemId";
