import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { submittedMathematicianRelated } from '../lib/mathematician-related.ts';
import { selectContentTranslationsByGroup } from '../lib/translation-routing.ts';

const row = (key, extra = {}) => ({ key, category: 'SOURCE', referenceId: null, conceptId: null, problemId: null, relation: '', labelMarkdown: '', noteMarkdown: '', ...extra });
function form(rows) {
  const result = new FormData(); result.set('relatedItems', JSON.stringify(rows));
  for (const r of rows) { result.set(`related-${r.key}-label`, r.labelMarkdown); result.set(`related-${r.key}-note`, r.noteMarkdown); }
  return result;
}
function compiled(file, modules) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; vm.runInNewContext(code, { exports, require: name => modules[name] ?? {}, Response, URL, Error }); return exports;
}
const db = compiled('../lib/mathematician-related-db.ts', { '@/lib/markdown': { renderInlineMarkdown: async x => x } });

test('live catalogue titles follow corrections while unavailable links retain their saved text', async () => {
  const input = { ...row('a', { referenceId: 1, labelMarkdown: 'Old title', noteMarkdown: 'Page 3' }), reference: { status: 'PUBLISHED', slug: 'book', authors: 'Author', canonicalTitle: 'New title', translations: [{ language: 'fr', displayTitle: 'Titre corrigé' }] } };
  const [live] = await db.relatedItemViews([input], 'fr');
  assert.equal(live.labelMarkdown, 'Author — Titre corrigé'); assert.equal(live.noteMarkdown, 'Page 3');
  input.reference.status = 'ARCHIVED';
  const [archived] = await db.relatedItemViews([input], 'fr');
  assert.equal(archived.labelMarkdown, 'Old title'); assert.equal(archived.href, null); assert.equal(archived.unavailable, true);
});

test('empty drafts and incomplete bibliography survive; live fields override metadata', () => {
  assert.deepEqual(submittedMathematicianRelated(form([])), []);
  const f = form([row('draft')]); f.set('related-draft-note', '$u=v$');
  assert.deepEqual(submittedMathematicianRelated(f), [row('draft', { noteMarkdown: '$u=v$' })]);
  assert.equal(submittedMathematicianRelated(new FormData()), undefined);
  const old = new FormData(); old.set('referenceIds', '1'); old.set('language', 'fr');
  assert.throws(() => submittedMathematicianRelated(old), /ancien/);
});
test('reject duplicate identities, mismatched targets, missing text and oversized input', () => {
  for (const rows of [[row('a'), row('a')], [row('a', { referenceId: 1 }), row('b', { referenceId: 1 })], [row('a', { conceptId: 2 })], [row('a', { referenceId: 0 })], [row('a', { relation: 'EPONYM' })], Array.from({ length: 101 }, (_, i) => row(String(i)))]) assert.throws(() => submittedMathematicianRelated(form(rows)));
  const f = form([row('a')]); f.delete('related-a-note'); assert.throws(() => submittedMathematicianRelated(f));
  // The same book can legitimately be both a work and a source, with different notes.
  assert.equal(submittedMathematicianRelated(form([row('a', { referenceId: 1 }), row('b', { referenceId: 1, category: 'WORK' })])).length, 2);
});
function storage(initial) {
  let stored = structuredClone(initial), validations = 0;
  const tx = {
    libraryReference: { findFirst: async ({ where }) => { validations++; assert.equal(where.status, 'PUBLISHED'); assert.equal(where.searchable, true); return where.id === 2 ? { id: 2 } : null; } },
    mathematicianRelatedItem: {
      findMany: async ({ where }) => stored.filter(r => r.translationId === where.translationId),
      deleteMany: async ({ where }) => { stored = stored.filter(r => r.translationId !== where.translationId || where.key.notIn.includes(r.key)); },
      upsert: async ({ where, create, update }) => { const k = where.translationId_key; const i = stored.findIndex(r => r.key === k.key && r.translationId === k.translationId); if (i < 0) stored.push(create); else stored[i] = { ...stored[i], ...update }; }
    }
  };
  return { tx, rows: () => stored, validations: () => validations };
}
test('reordering/classifying an archived legacy link preserves IDs and the other language', async () => {
  const h = storage([{ ...row('old', { referenceId: 99, category: 'LEGACY' }), id: 7, translationId: 1 }, { ...row('en', { labelMarkdown: 'English source' }), translationId: 2 }]);
  await db.syncMathematicianRelated(h.tx, 1, [row('new', { referenceId: 2 }), row('old', { referenceId: 99, category: 'WORK', noteMarkdown: 'Livre I, $x$' })]);
  assert.equal(h.validations(), 1);
  assert.equal(h.rows().find(r => r.key === 'old').id, 7);
  assert.equal(h.rows().find(r => r.key === 'old').position, 1);
  assert.equal(h.rows().find(r => r.key === 'old').noteMarkdown, 'Livre I, $x$');
  assert.equal(h.rows().find(r => r.translationId === 2).labelMarkdown, 'English source');
  await db.syncMathematicianRelated(h.tx, 1, []);
  assert.equal(h.rows().length, 1); assert.equal(h.rows()[0].translationId, 2);
});
test('unavailable new targets fail before any link deletion', async () => {
  const initial = [{ ...row('old'), translationId: 1 }], h = storage(initial);
  await assert.rejects(db.syncMathematicianRelated(h.tx, 1, [row('bad', { referenceId: 99 })]), /no longer available/);
  assert.deepEqual(h.rows(), initial);
});
test('search requires access and returns a bounded list with one preferred translation per concept', async () => {
  let user = null, searches = 0, limit = false;
  const api = compiled('../app/api/library/related/search/route.ts', {
    '@/lib/auth': { getCurrentUser: async () => user }, '@/lib/permissions': { canUseAdminTools: u => u.role === 'ADMIN' },
    '@/lib/rate-limit': { assertRateLimit: async () => { if (limit) throw new Error(); } },
    '@/lib/markdown': { renderInlineMarkdown: async x => x }, '@/lib/translation-routing': { selectContentTranslationsByGroup },
    '@/lib/db': { prisma: { concept: { findMany: async ({ where }) => { searches++; assert.equal(where.status.not, 'MISSING'); return Array.from({ length: 12 }, (_, i) => ['en', 'fr'].map(language => ({ id: 2 * i + Number(language === 'fr'), title: `Concept ${i}`, slug: `${i}-${language}`, language, translationGroupId: String(i) }))).flat(); } } } }
  });
  const request = offset => new Request(`http://localhost/api/library/related/search?kind=CONCEPT&q=concept&lang=fr&offset=${offset}`);
  assert.equal((await api.GET(request(0))).status, 403); assert.equal(searches, 0);
  user = { id: 1, role: 'ADMIN' };
  const response = await api.GET(request(0)), first = await response.json();
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(first.results.length, 10); assert.equal(first.more, true); assert.ok(first.results.every(r => r.language === 'fr'));
  const last = await (await api.GET(request(10))).json(); assert.equal(last.results.length, 2); assert.equal(last.more, false);
  limit = true; assert.equal((await api.GET(request(0))).status, 429);
});
