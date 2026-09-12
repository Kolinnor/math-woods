import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import * as schedule from '../lib/daily-problem-schedule.ts';
const require = createRequire(import.meta.url);

test('lower only the like threshold; keep random choice stable and never recycle exhausted groups', () => {
  for (const [likes, expected] of [ [[8,4,3,0],[8,4]], [[3,2,0],[3]], [[2,1],[2]], [[1,0],[1]], [[0,0],[0,0]], [[],[]] ]) {
    assert.deepEqual(schedule.dailyProblemLikePool(likes.map(likes => ({ likes }))).map(c => c.likes), expected);
  }
  const candidates = [{ translationGroupId: 'a' }, { translationGroupId: 'b' }];
  assert.equal(schedule.automaticDailyProblemGroup(candidates, '2026-09-12'), schedule.automaticDailyProblemGroup([...candidates].reverse(), '2026-09-12'));
  assert.equal(schedule.automaticDailyProblemGroup(candidates, '2026-09-12', ['a','b']), null);
  assert.equal(schedule.dailyProblemDateKey(new Date('2026-09-11T22:01:00Z')), '2026-09-12');
});

test('SQL eligibility, translation likes, history, manual priority and concurrent daily persistence', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Problem" (id INT PRIMARY KEY, "translationGroupId" TEXT, status TEXT DEFAULT 'PUBLISHED',
        listed BOOLEAN DEFAULT true, "isExercise" BOOLEAN DEFAULT false, "isConjecture" BOOLEAN DEFAULT false,
        "qualityStatus" TEXT DEFAULT 'REVIEWED', "needsReviewAfterEdit" BOOLEAN DEFAULT false, difficulty INT DEFAULT 30,
        language TEXT DEFAULT 'fr', "translatedFromProblemId" INT, "authorId" INT DEFAULT 99);
      CREATE TABLE "ProblemFavorite" ("userId" INT, "problemId" INT);
      CREATE TABLE "DailyProblemSchedule" ("dateKey" TEXT PRIMARY KEY, "problemId" INT);
      INSERT INTO "Problem" (id,"translationGroupId") SELECT n,'g'||n FROM generate_series(1,15) n;
      INSERT INTO "Problem" (id,"translationGroupId",language,"translatedFromProblemId") VALUES (16,'g1','en',1);
      UPDATE "Problem" SET difficulty=20 WHERE id=1;
      UPDATE "Problem" SET difficulty=50 WHERE id=2;
      UPDATE "Problem" SET difficulty=19 WHERE id=4;
      UPDATE "Problem" SET difficulty=51 WHERE id=5;
      UPDATE "Problem" SET difficulty=NULL WHERE id=6;
      UPDATE "Problem" SET "isExercise"=true WHERE id=7;
      UPDATE "Problem" SET "isConjecture"=true WHERE id=8;
      UPDATE "Problem" SET "qualityStatus"='UNREVIEWED' WHERE id=9;
      UPDATE "Problem" SET "needsReviewAfterEdit"=true WHERE id=10;
      UPDATE "Problem" SET status='DRAFT' WHERE id=11;
      UPDATE "Problem" SET listed=false WHERE id=12;
      UPDATE "Problem" SET language='es' WHERE id=13;
      INSERT INTO "DailyProblemSchedule" VALUES ('2026-08-01',14),('2026-10-01',15);
      INSERT INTO "ProblemFavorite" SELECT n,1 FROM generate_series(1,4) n;
      INSERT INTO "ProblemFavorite" VALUES (1,16),(5,16),(99,1),(99,16);
      INSERT INTO "ProblemFavorite" SELECT n,2 FROM generate_series(1,4) n;
      INSERT INTO "ProblemFavorite" SELECT n,3 FROM generate_series(1,3) n;
    `);
    let writes = 0, queries = 0, concurrentManual = false;
    const prisma = {
      $queryRaw: async q => { queries++; return (await db.query(q.text, q.values)).rows; },
      dailyProblemSchedule: {
        findUnique: async ({ where }) => (await db.query(`SELECT s.*, json_build_object('translationGroupId',p."translationGroupId",'status',p.status,'listed',p.listed,'isExercise',p."isExercise") AS problem FROM "DailyProblemSchedule" s JOIN "Problem" p ON p.id=s."problemId" WHERE s."dateKey"=$1`, [where.dateKey])).rows[0] ?? null,
        createMany: async ({ data }) => {
          writes++;
          if (concurrentManual) await db.query('INSERT INTO "DailyProblemSchedule" VALUES ($1,3) ON CONFLICT DO NOTHING', [data[0].dateKey]);
          await db.query('INSERT INTO "DailyProblemSchedule" VALUES ($1,$2) ON CONFLICT DO NOTHING', [data[0].dateKey,data[0].problemId]);
        }
      }
    };
    const modules = { '@prisma/client': require('@prisma/client'), '@/lib/db': { prisma }, '@/lib/languages': { ACTIVE_CONTENT_LANGUAGES: [{code:'fr'},{code:'en'}] }, '@/lib/daily-problem-schedule': schedule };
    const exports = {};
    const code = ts.transpileModule(readFileSync('lib/automatic-daily-problem.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: name => modules[name] });
    const candidates = await prisma.$queryRaw(exports.automaticDailyCandidatesQuery);
    assert.deepEqual(candidates.map(c => [c.id,c.likes]), [[1,5],[2,4],[3,3]]);
    const beforeQueries = queries;
    assert.equal((await exports.getOrCreateDailyProblemSchedule('2026-10-01')).problemId,15);
    assert.equal(queries,beforeQueries); assert.equal(writes,0);
    concurrentManual = true;
    assert.equal((await exports.getOrCreateDailyProblemSchedule('2026-09-10')).problemId,3);
    await db.query('DELETE FROM "DailyProblemSchedule" WHERE "dateKey"=$1', ['2026-09-10']);
    concurrentManual = false;
    const writesBeforePreview = writes;
    const preview = await exports.selectAutomaticDailyProblem('2026-09-12');
    assert.ok([1,2].includes(preview.id)); assert.equal(writes,writesBeforePreview);
    const [first,second] = await Promise.all([exports.getOrCreateDailyProblemSchedule('2026-09-12'),exports.getOrCreateDailyProblemSchedule('2026-09-12')]);
    assert.equal(first.problemId,preview.id); assert.equal(first.problemId,second.problemId);
    const next = await exports.getOrCreateDailyProblemSchedule('2026-09-13');
    assert.notEqual(next.problemId,first.problemId); assert.ok([1,2].includes(next.problemId));
    assert.equal((await exports.selectAutomaticDailyProblem('2026-09-14')).id,3);
    await db.exec('DELETE FROM "ProblemFavorite";');
    assert.equal((await exports.selectAutomaticDailyProblem('2026-09-14')).likes,0);
    assert.equal((await exports.getOrCreateDailyProblemSchedule('2026-09-14')).problemId,3);
    const beforeWrites = writes;
    assert.equal(await exports.getOrCreateDailyProblemSchedule('2026-09-15'),null);
    assert.equal(await exports.getOrCreateDailyProblemSchedule('invalid'),null);
    assert.equal(writes,beforeWrites);
  } finally { await db.close(); }
});
