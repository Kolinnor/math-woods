import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);

test('public homepage totals deduplicate translations and member solves, excluding unavailable content', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Problem" (id INT, "translationGroupId" TEXT, status TEXT, listed BOOLEAN, language TEXT);
      CREATE TABLE "Concept" ("translationGroupId" TEXT, status TEXT, language TEXT);
      CREATE TABLE "ProblemAttempt" ("userId" INT, "problemId" INT, status TEXT);
      INSERT INTO "Problem" VALUES
        (1,'a','PUBLISHED',true,'fr'), (2,'a','PUBLISHED',true,'en'),
        (3,'b','PUBLISHED',true,'en'), (4,'draft','DRAFT',true,'fr'),
        (5,'unlisted','PUBLISHED',false,'fr'), (6,'future','PUBLISHED',true,'es'),
        (7,'a','DRAFT',true,'es');
      INSERT INTO "Concept" VALUES ('c','STUB','fr'),('c','REVIEWED','en'),
        ('d','USABLE','en'),('missing','MISSING','fr'),('future','REVIEWED','es');
      INSERT INTO "ProblemAttempt" VALUES
        (1,1,'SOLVED'),(1,2,'SOLVED'),(2,1,'SOLVED'),(1,3,'STARTED'),
        (1,4,'SOLVED'),(1,5,'SOLVED'),(1,6,'SOLVED'),(3,7,'SOLVED');
    `);
    const modules = {
      '@prisma/client': require('@prisma/client'),
      'next/cache': { unstable_cache: fn => fn },
      '@/lib/languages': { ACTIVE_CONTENT_LANGUAGES: [{ code: 'en' }, { code: 'fr' }] },
      '@/lib/db': { prisma: { $queryRaw: async q => (await db.query(q.text, q.values)).rows } }
    };
    const exports = {};
    const code = ts.transpileModule(readFileSync('lib/home-public-stats.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    vm.runInNewContext(code, { exports, require: name => modules[name] });
    assert.deepEqual(JSON.parse(JSON.stringify(await exports.getHomePublicStats())), { problems: 2, concepts: 2, resolutions: 3 });
    await db.exec('DELETE FROM "Problem"; DELETE FROM "Concept"; DELETE FROM "ProblemAttempt";');
    assert.deepEqual(JSON.parse(JSON.stringify(await exports.getHomePublicStats())), { problems: 0, concepts: 0, resolutions: 0 });
  } finally { await db.close(); }
});
