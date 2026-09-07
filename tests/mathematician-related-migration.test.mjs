// Optional real PostgreSQL engine in a disposable in-memory database.
// Set MW_PGLITE_MODULE to the absolute path of @electric-sql/pglite/dist/index.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

test('PostgreSQL migration preserves legacy notes, order, languages and orphaned translations', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Mathematician" (id SERIAL PRIMARY KEY, name TEXT, "birthPlace" TEXT, "contentMarkdown" TEXT, "contentHtml" TEXT);
      CREATE TABLE "MathematicianTranslation" (id SERIAL PRIMARY KEY, "mathematicianId" INT REFERENCES "Mathematician"(id), language TEXT, "displayName" TEXT, "birthPlace" TEXT, "biographyMarkdown" TEXT, "biographyHtml" TEXT, "updatedAt" TIMESTAMP, UNIQUE("mathematicianId", language));
      CREATE TABLE "LibraryReference" (id SERIAL PRIMARY KEY, "canonicalTitle" TEXT);
      CREATE TABLE "Concept" (id SERIAL PRIMARY KEY, title TEXT);
      CREATE TABLE "Problem" (id SERIAL PRIMARY KEY, title TEXT);
      CREATE TABLE "MathematicianWork" (id SERIAL PRIMARY KEY, "mathematicianId" INT, "referenceId" INT, note TEXT, position INT);
      CREATE TABLE "MathematicianConcept" (id SERIAL PRIMARY KEY, "mathematicianId" INT, "conceptId" INT, note TEXT, position INT);
      CREATE TABLE "MathematicianProblem" (id SERIAL PRIMARY KEY, "mathematicianId" INT, "problemId" INT, note TEXT, position INT);
      INSERT INTO "Mathematician" VALUES (1, 'Euler', '', '', ''), (2, 'Legacy person', 'Paris', 'Old biography', '<p>Old biography</p>');
      INSERT INTO "MathematicianTranslation" ("mathematicianId",language,"displayName") VALUES (1,'fr','Euler'),(1,'en','Euler');
      INSERT INTO "LibraryReference" VALUES (1,'Collected works'),(2,'Biography');
      INSERT INTO "Concept" VALUES (1,'Euler characteristic'); INSERT INTO "Problem" VALUES (1,'Seven bridges');
      INSERT INTO "MathematicianWork" VALUES (1,1,1,'Volume II',3),(2,1,2,'Page 42',1),(3,2,1,NULL,0);
      INSERT INTO "MathematicianConcept" VALUES (1,1,1,'Original concept note',5);
      INSERT INTO "MathematicianProblem" VALUES (1,1,1,'Historical note',2);
    `);
    await db.exec(readFileSync(new URL('../prisma/migrations/20260907110000_mathematician_related_items/migration.sql', import.meta.url), 'utf8'));
    const { rows } = await db.query('SELECT * FROM "MathematicianRelatedItem" ORDER BY "translationId", category, position');
    assert.equal(rows.length, 9);
    assert.equal(rows.filter(r=>r.category==='LEGACY').length, 5);
    assert.deepEqual(rows.filter(r=>r.translationId===1 && r.category==='LEGACY').map(r=>[r.labelMarkdown,r.noteMarkdown,r.position]), [['Biography','Page 42',1],['Collected works','Volume II',3]]);
    assert.deepEqual(rows.filter(r=>r.translationId===1).map(r=>[r.key,r.noteMarkdown]), rows.filter(r=>r.translationId===2).map(r=>[r.key,r.noteMarkdown]));
    const fallback = (await db.query('SELECT * FROM "MathematicianTranslation" WHERE "mathematicianId"=2')).rows[0];
    assert.equal(fallback.language,'fr'); assert.equal(fallback.biographyMarkdown,'Old biography');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "MathematicianWork"')).rows[0].n,3);
    await db.exec('DELETE FROM "LibraryReference" WHERE id=1');
    const deleted = (await db.query(`SELECT * FROM "MathematicianRelatedItem" WHERE key='legacy-work-1'`)).rows;
    assert.equal(deleted.length,2); assert.ok(deleted.every(r=>r.referenceId===null && r.labelMarkdown==='Collected works' && r.noteMarkdown==='Volume II'));
    await db.exec('DELETE FROM "MathematicianTranslation" WHERE id=1');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "MathematicianRelatedItem" WHERE "translationId"=2')).rows[0].n,4);
  } finally { await db.close(); }
});
