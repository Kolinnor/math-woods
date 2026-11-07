-- Translations may share an alias. Cross-family conflicts remain guarded by
-- syncConceptAliases under the content-slugs:concept transaction lock.
DROP INDEX "ConceptAlias_aliasSlug_key";
CREATE UNIQUE INDEX "ConceptAlias_conceptId_aliasSlug_key" ON "ConceptAlias"("conceptId", "aliasSlug");
CREATE INDEX "ConceptAlias_aliasSlug_idx" ON "ConceptAlias"("aliasSlug");
