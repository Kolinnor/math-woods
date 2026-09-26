import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), root = process.cwd();
const cache = new Map();
let clash = null, dbError = null, authorized = true;
const writes = [], redirects = [];
const mocks = {
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/cache': { revalidatePath: () => {} },
  'next/navigation': { redirect: href => { redirects.push(href); throw Error('REDIRECT'); } },
  '@/lib/auth': { requireAdmin: async () => { if (!authorized) throw Error('FORBIDDEN'); return { id: 1, role: 'ADMIN' }; } },
  '@/lib/db': { prisma: { libraryEra: {
    findUnique: async ({ where }) => 'startYear' in where ? clash : null,
    create: async ({ data }) => { if (dbError) throw dbError; writes.push(data); },
    update: async ({ data }) => { if (dbError) throw dbError; writes.push(data); }
  } } },
  '@/lib/library-queries': { localizedTranslation: rows => rows[0] }
};
function load(name) {
  if (name in mocks) return mocks[name];
  if (!name.startsWith('@/')) return require(name);
  if (cache.has(name)) return cache.get(name);
  const base = path.join(root, name.slice(2));
  const file = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync);
  assert.ok(file, `Module ${name}`);
  const module = { exports: {} }; cache.set(name, module.exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
  } }).outputText;
  new Function('require', 'module', 'exports', code)(specifier => load(specifier.startsWith('.')
    ? '@/' + path.relative(root, path.resolve(path.dirname(file), specifier)).replaceAll('\\', '/').replace(/\.tsx?$/, '') : specifier), module, module.exports);
  return module.exports;
}
const display = load('@/lib/library-display');
const { historyEraWhere, milestoneEndYear, overlapsLibraryEra } = load('@/lib/library-era-filters');
const { selectFriseOverview, selectFriseEra } = load('@/lib/library-frise');
const { LibraryFrise } = load('@/components/library/LibraryFrise');
const { LibraryEraStrip } = load('@/components/library/LibraryEraStrip');
const { libraryEraPresets } = load('@/lib/library-eras');
const { parseMathematicianFilters, filterMathematicians, MIN_HISTORY_YEAR } = load('@/lib/mathematician-browser');
const { saveLibraryEraAction } = load('@/lib/actions/library-era-actions');
const eras = display.resolveLibraryEras(display.DEFAULT_LIBRARY_ERAS, 2026);
const enlightenment = eras.find(era => era.slug === 'siecle-des-lumieres');
const modern = eras.find(era => era.slug === 'rigueur-abstraction');
const contemporary = eras.at(-1);
const render = props => renderToStaticMarkup(React.createElement(LibraryFrise, { locale: 'fr', ...props }));
const life = (i, score = 0) => ({ slug: `person-${i}`, name: `Person ${i}`, short: `P${i}`, from: 1900 + i, to: 2000, lifespan: '', score });

test('a featured entry survives lane saturation, and the rendered count matches the selected count', () => {
  const people = Array.from({ length: 45 }, (_, i) => life(i, i === 44 ? 1000 : 0));
  const selected = selectFriseEra({ people, milestones: [] }, contemporary, eras);
  assert.equal(selected.people.length, 40);
  const html = render({ eras: [contemporary], ...selected, totals: undefined, lanes: { people: 16, periods: 3, events: 6 } });
  assert.equal((html.match(/class="library-frise-life"/g) ?? []).length, 40);
  assert.ok(html.includes('/library/mathematicians/person-44'));
  for (const person of selected.people) assert.ok(html.includes(`/library/mathematicians/${person.slug}"`));
});

test('overlapping periods and events are all rendered too', () => {
  const milestones = Array.from({ length: 8 }, (_, i) => ({ slug: `m-${i}`, sortYear: 1910, endYear: i < 4 ? 2000 : null,
    period: i < 4, title: `Milestone ${i}`, dateLabel: '1910', typeLabel: 'Event', score: 0 }));
  const html = render({ eras: [contemporary], people: [], milestones, lanes: { people: 1, periods: 1, events: 1 } });
  for (const milestone of milestones) assert.ok(html.includes(`/library/history/${milestone.slug}"`));
  assert.equal((html.match(/class="library-frise-period"/g) ?? []).length, 4);
  assert.equal((html.match(/class="library-frise-event"/g) ?? []).length, 4);
});

// Evaluate the Prisma predicate on fixtures without a database. Assert against
// explicit expected results, including dates before/after the visual timeline.
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(item => matches(row, item));
    if (key === 'OR') return value.some(item => matches(row, item));
    if (typeof value !== 'object') return row[key] === value;
    return row[key] !== null && Object.entries(value).every(([op, bound]) => op === 'gte' ? row[key] >= bound : row[key] <= bound);
  });
}
const milestoneRows = [
  { slug: 'crosses', sortYear: 1600, endYear: 1800, milestoneType: 'PERIOD' },
  { slug: 'event', sortYear: 1700, endYear: null, milestoneType: 'EVENT' },
  { slug: 'before', sortYear: 1600, endYear: 1699, milestoneType: 'PERIOD' },
  { slug: 'after', sortYear: 1800, endYear: null, milestoneType: 'EVENT' },
  { slug: 'no-end', sortYear: 1600, endYear: null, milestoneType: 'PERIOD' },
  { slug: 'ancient', sortYear: -5000, endYear: null, milestoneType: 'EVENT' },
  { slug: 'future', sortYear: 2800, endYear: null, milestoneType: 'EVENT' }
];
const milestones = milestoneRows.map(row => ({ ...row, period: row.milestoneType === 'PERIOD' && row.endYear !== null, score: 0, title: row.slug, dateLabel: '', typeLabel: '' }));

test('history filters use inclusive overlap, handle missing ends and keep outer-era dates', () => {
  assert.deepEqual(milestoneRows.filter(row => matches(row, historyEraWhere(eras, enlightenment))).map(row => row.slug), ['crosses', 'event']);
  assert.deepEqual(milestoneRows.filter(row => matches(row, historyEraWhere(eras, modern))).map(row => row.slug), ['crosses', 'after']);
  assert.ok(matches(milestoneRows[5], historyEraWhere(eras, eras[0])));
  assert.ok(matches(milestoneRows[6], historyEraWhere(eras, contemporary)));
  for (const era of eras) for (const row of milestoneRows) {
    assert.equal(matches(row, historyEraWhere(eras, era)), overlapsLibraryEra(eras, era, row.sortYear, milestoneEndYear(row)));
  }
});

test('overview and zoom totals match history filters, without duplicating selected periods', () => {
  const overview = selectFriseOverview({ people: [], milestones }, eras);
  assert.equal(overview.totals[enlightenment.slug].milestones, 2);
  assert.equal(overview.totals[modern.slug].milestones, 2);
  assert.equal(new Set(overview.milestones.map(row => row.slug)).size, overview.milestones.length);
  for (const era of eras) {
    const expected = milestoneRows.filter(row => matches(row, historyEraWhere(eras, era))).length;
    assert.equal(overview.totals[era.slug].milestones, expected);
    assert.equal(selectFriseEra({ people: [], milestones }, era, eras).totals.milestones, expected);
  }
});

test('a life spanning two eras is counted in both and opens a bilingual catalogue', () => {
  const gauss = { ...life(0), slug: 'gauss', from: 1777, to: 1855 };
  const overview = selectFriseOverview({ people: [gauss], milestones: [] }, eras);
  const person = { id: 1, name: 'Gauss', aliases: [], lifespan: '1777–1855', status: 'PUBLISHED', needsReviewAfterEdit: false,
    createdAt: new Date(), updatedAt: new Date(), translations: [{ language: 'en', displayName: 'Gauss', teaser: '', biographyHtml: '', contributionsHtml: '' }] };
  const html = render({ locale: 'fr', eras, ...overview });
  for (const era of [enlightenment, modern]) {
    assert.equal(overview.totals[era.slug].people, 1);
    const href = html.match(new RegExp(`href="([^"]*mathematicians\\?era=${era.slug}[^\"]*)"`))[1].replaceAll('&amp;', '&');
    const query = new URL(href, 'https://example.test').searchParams;
    const filters = parseMathematicianFilters({ era: query.get('era'), language: query.getAll('language') }, 'fr', 2026, libraryEraPresets(eras, MIN_HISTORY_YEAR));
    assert.equal(filterMathematicians([person], filters, 'fr', 2026).length, 1);
  }
});

test('All eras includes undated entries and does not sum overlapping counts', () => {
  const html = renderToStaticMarkup(React.createElement(LibraryEraStrip, { locale: 'fr', eras: [enlightenment, modern],
    counts: { [enlightenment.slug]: 2, [modern.slug]: 2 }, totalCount: 3, label: 'Époques', allHref: '/all', hrefFor: slug => '/' + slug }));
  assert.match(html, /Toutes les époques<em>3<\/em>/);
});

function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ locale: 'fr', nameFr: 'Nouvelle époque', nameEn: 'New era', startYear: '1750',
    color: '#abcdef', descriptionFr: 'Texte à conserver', descriptionEn: 'Keep this text', ...overrides })) data.set(key, value);
  return data;
}
test('era validation returns inline errors without redirecting or writing, for create and edit', async () => {
  writes.length = 0; redirects.length = 0;
  for (const id of [null, 1]) for (const values of [{ startYear: '0' }, { startYear: '9999' }, { nameFr: '' }, { color: 'red' }]) {
    const data = form(values), before = [...data];
    const result = await saveLibraryEraAction(id, { error: '' }, data);
    assert.ok(result.error); assert.deepEqual([...data], before);
  }
  clash = { id: 2, nameFr: 'Autre époque', nameEn: 'Other era' };
  assert.match((await saveLibraryEraAction(1, { error: '' }, form())).error, /commence déjà/);
  assert.match((await saveLibraryEraAction(null, { error: '' }, form({ locale: 'en' }))).error, /already starts/);
  clash = null;
  assert.equal(writes.length, 0); assert.equal(redirects.length, 0);
});

test('a corrected era saves, redirects only on success, and retains admin authorization', async () => {
  writes.length = 0; redirects.length = 0;
  for (const id of [null, 1]) await assert.rejects(saveLibraryEraAction(id, { error: 'Previous error' }, form()), /REDIRECT/);
  assert.equal(writes.length, 2); assert.equal(writes[0].descriptionFr, 'Texte à conserver');
  assert.equal(redirects.length, 2); assert.ok(redirects.every(url => url.startsWith('/library/eras?saved=')));
  authorized = false;
  await assert.rejects(saveLibraryEraAction(1, { error: '' }, form()), /FORBIDDEN/);
  authorized = true;
  dbError = Object.assign(Error('internal database details'), { code: 'P2002' });
  const result = await saveLibraryEraAction(null, { error: '' }, form());
  assert.match(result.error, /saisie est conservée/); assert.ok(!result.error.includes('internal database'));
  dbError = null;
});
