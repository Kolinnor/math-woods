import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as permissions from '../lib/permissions.ts';
import * as limits from '../lib/content-limits.ts';
import * as names from '../lib/mathematician-names.ts';
import * as portraits from '../lib/portrait.ts';
import * as related from '../lib/mathematician-related.ts';
import * as browser from '../lib/mathematician-browser.ts';
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL('../lib/actions/library-actions.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const version = new Date('2026-09-07T12:00:00Z');
const form = (intent = 'save', timestamp = version.toISOString()) => {
  const data = new FormData();
  Object.entries({ name: 'Emmy Noether', language: 'fr', intent, baseUpdatedAt: timestamp }).forEach(([key,value]) => data.set(key,value));
  return data;
};
function harness(status, actorId = 2, race = false) {
  const entry = { id: 1, slug: 'noether', name: 'Emmy Noether', createdById: 1, lastEditedById: 3, status, updatedAt: version, submittedAt: version, publishedAt: version, needsReviewAfterEdit: status === 'PUBLISHED', translations: [{ displayName: 'Emmy Noether' }] };
  const writes = [];
  const notifications = [];
  const modules = {
    '@prisma/client': require('@prisma/client'),
    '@/lib/auth': { requireAdmin: async () => ({ id: actorId, role: 'ADMIN' }) },
    '@/lib/permissions': permissions,
    '@/lib/content-limits': limits,
    '@/lib/mathematician-names': names,
    '@/lib/mathematician-browser': browser,
    '@/lib/portrait': portraits,
    '@/lib/mathematician-related': related,
    '@/lib/markdown': { renderMarkdown: async text => text },
    '@/lib/rate-limit': { assertRateLimit: async () => {} },
    '@/lib/user-display': { displayNameForUser: () => 'Editor' },
    '@/lib/notifications': { createNotification: async input => notifications.push(input) },
    'next/cache': { revalidatePath: () => {} },
    'next/navigation': { redirect: () => {} },
    '@/lib/db': { prisma: {
      mathematician: {
        findUnique: async () => entry,
        updateMany: async ({ where, data }) => {
          assert.equal(where.updatedAt.getTime(), version.getTime());
          assert.equal(where.status, status);
          if (race) return { count: 0 };
          writes.push(data); return { count: 1 };
        }
      },
      notification: { updateMany: async () => {} },
      libraryHomepageSelection: { updateMany: async () => {} },
      user: { findMany: async () => [] },
      $transaction: async callback => callback({ mathematician: { update: async ({ where, data }) => {
        assert.equal(where.updatedAt.getTime(), version.getTime());
        if (race) throw new Error('Concurrent update rejected');
        writes.push(data);
      } } })
    } }
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => modules[name] ?? {}, FormData, Date, Error });
  return { actions: exports, entry, writes, notifications };
}

test('admins can view and edit all mathematician states but cannot review their own work', () => {
  for (const role of ['ADMIN', 'OWNER']) {
    const user = { id: 2, role };
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'NEEDS_WORK', 'PUBLISHED', 'ARCHIVED']) {
      const entry = { createdById: 1, status };
      assert.equal(permissions.canViewLibraryMathematician(user, entry), true);
      assert.equal(permissions.canEditLibraryMathematician(user, entry), true);
    }
    assert.equal(permissions.canReviewLibraryMathematician(user, { createdById: 2, lastEditedById: 3 }), false);
    assert.equal(permissions.canReviewLibraryMathematician(user, { createdById: 1, lastEditedById: 2 }), false);
    assert.equal(permissions.canReviewLibraryMathematician(user, { createdById: 1, lastEditedById: 3 }), true);
  }
  assert.equal(permissions.canEditLibraryMathematician({ id: 2, role: 'USER' }, { createdById: 1, status: 'PENDING_REVIEW' }), false);
  assert.equal(permissions.canViewLibraryMathematician(null, { createdById: 1, status: 'DRAFT' }), false);
});

test('editing preserves publication/pending/archive status and requires a fresh independent review', async () => {
  for (const status of ['PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED']) for (const intent of ['save', 'submit', 'draft']) {
    const h = harness(status);
    await h.actions.updateMathematicianAction(1, form(intent));
    assert.equal(h.writes.length, 1);
    const data = h.writes[0];
    assert.equal(data.status, status);
    assert.equal(data.lastEditedById, 2);
    assert.equal(data.needsReviewAfterEdit, status === 'PUBLISHED');
    assert.equal(data.reviewedById, null);
    assert.equal(data.reviewedAt, null);
    assert.equal(data.publishedAt, undefined);
    assert.equal(data.submittedAt, version);
  }
});

test('server refuses review by the author and last editor, including admins', async () => {
  for (const status of ['PENDING_REVIEW', 'PUBLISHED']) for (const actorId of [1, 3]) {
    const h = harness(status, actorId);
    await assert.rejects(h.actions.reviewLibraryEntryAction('mathematician', 1, 'publish', form()), /second trusted/);
    assert.equal(h.writes.length, 0);
  }
});

test('structured dates and a language-specific sort name save together without overwriting old forms', async () => {
  const h = harness('PUBLISHED'), data = form();
  data.set('periodStartYear','1882'); data.set('periodEndYear','1935'); data.set('sortName','Noether, Emmy');
  await h.actions.updateMathematicianAction(1,data);
  assert.equal(h.writes[0].periodStartYear,1882); assert.equal(h.writes[0].periodEndYear,1935);
  assert.equal(h.writes[0].translations.upsert.where.mathematicianId_language.language,'fr');
  assert.equal(h.writes[0].translations.upsert.update.sortName,'Noether, Emmy');
  await h.actions.updateMathematicianAction(1,form());
  assert.equal(h.writes[1].periodStartYear,undefined); assert.equal(h.writes[1].translations.upsert.update.sortName,undefined);
  data.set('periodEndYear','1800'); await assert.rejects(h.actions.updateMathematicianAction(1,data),/précéder/);
  assert.equal(h.writes.length,2);
});

test('independent review clears the flag without changing original publication date', async () => {
  const h = harness('PUBLISHED');
  await h.actions.reviewLibraryEntryAction('mathematician', 1, 'publish', form());
  assert.equal(h.writes[0].needsReviewAfterEdit, false);
  assert.equal(h.writes[0].reviewedById, 2);
  assert.equal(h.writes[0].publishedAt, version);
  const pending = harness('PENDING_REVIEW');
  await pending.actions.reviewLibraryEntryAction('mathematician', 1, 'publish', form());
  assert.equal(pending.writes[0].status, 'PUBLISHED');
});

test('review and edit reject stale forms and concurrent changes', async () => {
  const oldForm = form('save', '2026-09-01T00:00:00Z');
  for (const action of ['edit', 'review']) {
    const h = harness('PENDING_REVIEW');
    await assert.rejects(action === 'edit' ? h.actions.updateMathematicianAction(1, oldForm) : h.actions.reviewLibraryEntryAction('mathematician', 1, 'publish', oldForm), /changed after/);
    assert.equal(h.writes.length, 0);
    const race = harness('PENDING_REVIEW', 2, true);
    await assert.rejects(action === 'edit' ? race.actions.updateMathematicianAction(1, form()) : race.actions.reviewLibraryEntryAction('mathematician', 1, 'publish', form()), /Concurrent|Reload/);
    assert.equal(race.writes.length, 0);
  }
});

test('PostgreSQL migration preserves existing entries and handles a deleted editor', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "User" (id INTEGER PRIMARY KEY); CREATE TABLE "Mathematician" (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO "User" VALUES (2); INSERT INTO "Mathematician" VALUES (1, \'Emmy Noether\');');
    await db.exec(readFileSync(new URL('../prisma/migrations/20260907190000_mathematician_independent_review/migration.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await db.query('SELECT * FROM "Mathematician"')).rows[0], { id: 1, name: 'Emmy Noether', lastEditedById: null, needsReviewAfterEdit: false });
    await db.exec('UPDATE "Mathematician" SET "lastEditedById"=2, "needsReviewAfterEdit"=true; DELETE FROM "User" WHERE id=2;');
    assert.equal((await db.query('SELECT "lastEditedById" FROM "Mathematician"')).rows[0].lastEditedById, null);
  } finally { await db.close(); }
});
