import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as policy from '../lib/notification-policy.ts';

const require = createRequire(import.meta.url);
const { NotificationType } = require('@prisma/client');
function load(file, db) {
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const modules = { '@prisma/client': require('@prisma/client'), '@/lib/db': { prisma: db }, '@/lib/notification-policy': policy, 'next/cache': { revalidatePath() {} }, '@/lib/problem-edit-notifications': {} };
  vm.runInNewContext(compiled, { exports, require: name => { if (!(name in modules)) throw new Error(name); return modules[name]; }, Date });
  return exports;
}

test('retired library notifications are blocked even with enabled preferences', async () => {
  const db = new Proxy({}, { get() { throw new Error('Retired notifications must not reach storage'); } });
  const { createNotification } = load('lib/notifications.ts', db);
  for (const type of policy.RETIRED_LIBRARY_NOTIFICATION_TYPES) {
    assert.equal(await createNotification({ userId: 1, actorId: 2, type, title: 'Review', body: 'Legacy caller', href: '/library' }), null);
  }
});

test('daily concept review and other notifications remain enabled', async () => {
  const writes = [];
  const db = { notificationPreference: { findUnique: async () => ({ enabled: true }) }, notification: { create: async ({ data }) => { writes.push(data); return data; } } };
  const { createNotification } = load('lib/notifications.ts', db);
  for (const type of [NotificationType.DAILY_CONCEPT_REVIEW, NotificationType.FRIEND_REQUEST]) {
    await createNotification({ userId: 1, actorId: 2, type, title: 'Keep', body: 'Keep', href: '/concepts' });
  }
  assert.deepEqual(writes.map(row => row.type), [NotificationType.DAILY_CONCEPT_REVIEW, NotificationType.FRIEND_REQUEST]);
});

test('cleanup removes retired types for the current user without waiting for retention expiry', async () => {
  let where;
  const { cleanupNotificationsForUser } = load('lib/notification-lifecycle.ts', { notification: { deleteMany: async args => { where = args.where; } } });
  await cleanupNotificationsForUser(42);
  assert.equal(where.userId, 42);
  const retired = where.OR.find(condition => condition.type);
  assert.deepEqual(Array.from(retired.type.in), policy.RETIRED_LIBRARY_NOTIFICATION_TYPES);
  assert.equal(retired.readAt, undefined);
  assert.equal(retired.createdAt, undefined);
  assert.ok(!retired.type.in.includes(NotificationType.DAILY_CONCEPT_REVIEW));
});
