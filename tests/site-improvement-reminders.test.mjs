import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as copy from '../lib/site-improvement-reminder-copy.ts';
import * as security from '../lib/request-security.ts';
import { localizeNotification } from '../lib/notification-copy.ts';

const require = createRequire(import.meta.url);
function load(file, modules, env = {}) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env }, require: name => {
    if (name === '@prisma/client') return require(name);
    if (name in modules) return modules[name];
    throw new Error(`Unexpected module ${name}`);
  }, Date });
  return exports;
}

test('reminder starts at exactly 18:00 Paris through both daylight-saving transitions', () => {
  for (const [date, utcHour] of [ ['2026-01-15', 17], ['2026-07-15', 16], ['2026-03-29', 16], ['2026-10-25', 17] ]) {
    assert.equal(copy.siteImprovementReminderDate(new Date(`${date}T${utcHour - 1}:59:59Z`)), null);
    assert.equal(copy.siteImprovementReminderDate(new Date(`${date}T${utcHour}:00:00Z`)), date);
    assert.equal(copy.siteImprovementReminderDate(new Date(`${date}T${utcHour + 1}:00:00Z`)), date);
  }
  assert.equal(copy.siteImprovementReminderDate(new Date('2026-07-15T22:00:00Z')), null);
});

function fixture({ eligible = true, remaining = 4 } = {}) {
  const rows = [];
  let reads = 0;
  const db = {
    user: { findFirst: async ({ where }) => {
      reads++;
      assert.equal(where.username.equals, 'ancient-tree');
      assert.equal(where.username.mode, 'insensitive');
      assert.equal(where.role, 'OWNER'); assert.equal(where.deletedAt, null);
      assert.equal(where.notificationPreferences.none.type, 'SITE_IMPROVEMENT_REMINDER');
      assert.equal(where.notificationPreferences.none.enabled, false);
      return eligible ? { id: 42 } : null;
    } },
    siteImprovement: { count: async ({ where }) => {
      assert.equal(where.status.not, 'COMPLETED'); return remaining;
    } },
    notification: { createMany: async ({ data, skipDuplicates }) => {
      assert.equal(skipDuplicates, true);
      const row = data[0];
      if (rows.some(existing => existing.userId === row.userId && existing.type === row.type && existing.aggregationKey === row.aggregationKey)) return { count: 0 };
      rows.push(row); return { count: 1 };
    } }
  };
  const { sendSiteImprovementReminder } = load('lib/site-improvement-reminders.ts', {
    '@/lib/db': { prisma: db }, '@/lib/site-improvement-reminder-copy': copy,
    'next/cache': { revalidatePath() {} }
  });
  return { rows, send: sendSiteImprovementReminder, reads: () => reads };
}

test('owner receives one daily notification even with concurrent or repeated delivery, and a new one next day', async () => {
  const f = fixture();
  await f.send(new Date('2026-09-16T15:59:59Z'));
  assert.equal(f.reads(), 0);
  await Promise.all(Array.from({ length: 4 }, () => f.send(new Date('2026-09-16T16:00:00Z'))));
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].userId, 42);
  assert.equal(f.rows[0].href, '/contributing/tasks/site-improvements');
  assert.equal(localizeNotification(f.rows[0], 'fr').title, 'Il reste 4 améliorations du site à faire');
  await f.send(new Date('2026-09-17T16:00:00Z'));
  assert.equal(f.rows.length, 2);
  assert.notEqual(f.rows[0].aggregationKey, f.rows[1].aggregationKey);
});

test('missing, deactivated or opted-out owner is not notified; zero and singular counts are supported', async () => {
  const muted = fixture({ eligible: false });
  await muted.send(new Date('2026-09-16T16:00:00Z'));
  assert.equal(muted.rows.length, 0);
  for (const remaining of [0, 1]) {
    const f = fixture({ remaining });
    await f.send(new Date('2026-09-16T16:00:00Z'));
    assert.equal(f.rows.length, 1);
    assert.equal(localizeNotification(f.rows[0], 'fr').title,
      remaining ? 'Il reste 1 amélioration du site à faire' : 'Il reste 0 améliorations du site à faire');
  }
});

test('cron endpoint authenticates requests before delivery and rate-limits authorized callers', async () => {
  let calls = 0;
  let limited = false;
  const modules = {
    'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) } },
    '@/lib/site-improvement-reminders': { sendSiteImprovementReminder: async () => { calls++; return { created: 1, remaining: 4 }; } },
    '@/lib/rate-limit': { assertRateLimit: async () => { if (limited) throw Error('limit'); } },
    '@/lib/request-security': security
  };
  const { POST } = load('app/api/cron/site-improvement-reminder/route.ts', modules, { CRON_SECRET: 'test-only-secret' });
  const request = headers => new Request('https://example.test/api/cron/site-improvement-reminder', { method: 'POST', headers });
  assert.equal((await POST(request({}))).status, 401);
  assert.equal((await POST(request({ Authorization: 'Bearer wrong' }))).status, 401);
  assert.equal(calls, 0);
  assert.equal((await POST(request({ Authorization: 'Bearer test-only-secret' }))).status, 200);
  assert.equal((await POST(request({ 'x-cron-secret': 'test-only-secret' }))).status, 200);
  assert.equal(calls, 2);
  limited = true;
  assert.equal((await POST(request({ Authorization: 'Bearer test-only-secret' }))).status, 429);
  assert.equal(calls, 2);
  const unset = load('app/api/cron/site-improvement-reminder/route.ts', modules);
  assert.equal((await unset.POST(request({}))).status, 401);
});
