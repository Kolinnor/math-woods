import * as bibliography from "../lib/reference-bibtex.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as permissions from '../lib/permissions.ts';
import { fr } from '../lib/i18n/dictionaries/fr.ts';

const require = createRequire(import.meta.url), root = process.cwd();
function fixture(user = null, entry = null) {
  const queries = [], cache = new Map();
  const db = new Proxy({}, { get: (_, model) => new Proxy({}, { get: (_, method) => async args => {
    queries.push({ model, method, ...args });
    if (method === 'count') return 0;
    if (method === 'findFirst') return null;
    if (method === 'findUnique') return model === 'libraryHomepageSelection' ? null : entry;
    return [];
  } }) });
  const modules = {
    '@/lib/auth': {
      getCurrentUser: async () => user,
      requireAdmin: async () => { throw Error('ADMIN_GATE'); },
      requireVerifiedUser: async () => { if (!user || !permissions.isVerifiedContributor(user)) throw Error('SIGN_IN'); return user; }
    },
    '@/lib/reference-bibtex': bibliography,
    '@/lib/db': { prisma: db }, '@/lib/permissions': permissions,
    '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr', getTranslations: async () => fr },
    'next/navigation': { notFound: () => { throw Error('NOT_FOUND'); }, permanentRedirect: () => { throw Error('REDIRECT'); } },
    'next/link': { default: 'a' }
  };
  function load(name, from = root) {
    if (name in modules) return modules[name];
    if (name.startsWith('@/components/') || name.startsWith('@/lib/actions/')) return new Proxy({}, { get: (_, key) => String(key) });
    if (!name.startsWith('@/') && !name.startsWith('.') && !path.isAbsolute(name)) return require(name);
    const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(from, name);
    const file = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate));
    if (!file) throw Error(`Missing module ${name}`);
    if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function('exports', 'require', code)(exports, dependency => load(dependency, path.dirname(file)));
    return exports;
  }
  return { load: file => load(path.join(root, file)), queries };
}

test('guests can render the library home and all three catalogues with public-only queries', async () => {
  for (const file of ['app/library/page.tsx', 'app/library/history/page.tsx', 'app/library/mathematicians/page.tsx', 'app/library/references/page.tsx']) {
    const f = fixture();
    const tree = await f.load(file).default({ searchParams: Promise.resolve({}) });
    assert.ok(tree, file);
    const contentQueries = f.queries.filter(query => ['mathematician', 'historyMilestone', 'libraryReference'].includes(query.model));
    assert.ok(contentQueries.length > 0);
    for (const query of contentQueries) {
      assert.match(JSON.stringify(query.where), /PUBLISHED/, `${file}: ${query.model}.${query.method}`);
      assert.doesNotMatch(JSON.stringify(query.where), /DRAFT|PENDING_REVIEW|NEEDS_WORK|ARCHIVED/);
    }
  }
});

test('anonymous and ordinary readers cannot open unpublished entries or their presentation history', async () => {
  for (const user of [null, { id: 2, role: 'USER', emailVerifiedAt: new Date() }]) {
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'NEEDS_WORK', 'ARCHIVED']) {
      for (const file of ['app/library/mathematicians/[slug]/page.tsx', 'app/library/history/[slug]/page.tsx', 'app/library/references/[slug]/page.tsx', 'app/library/references/[slug]/history/page.tsx']) {
        const f = fixture(user, { id: 1, slug: 'private', status, createdById: 77, name: 'Private name', translations: [] });
        await assert.rejects(f.load(file).default({ params: Promise.resolve({ slug: 'private' }), searchParams: Promise.resolve({}) }), /NOT_FOUND/);
        assert.ok(!f.queries.some(query => query.model === 'libraryReferencePresentationRevision'));
      }
    }
  }
});

test('private mathematician names are not leaked in page metadata', async () => {
  const f = fixture(null, { name: 'Private name', createdById: 77, status: 'DRAFT', translations: [] });
  const metadata = await f.load('app/library/mathematicians/[slug]/page.tsx').generateMetadata({ params: Promise.resolve({ slug: 'private' }) });
  assert.equal(metadata.title, 'Mathematician');
});

test('public exports and sitemap select only published records', async () => {
  const f = fixture();
  const response = await f.load('app/library/references/export/route.ts').GET(new Request('https://example.test/library/references/export?format=json'));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), []);
  const exportQuery = f.queries.find(query => query.model === 'libraryReference');
  assert.deepEqual(exportQuery.where, { status: 'PUBLISHED', searchable: true, mergedIntoId: null });
  const sitemap = await f.load('app/sitemap.ts').default();
  for (const section of ['', '/history', '/mathematicians', '/references']) assert.ok(sitemap.some(item => item.url === `https://mathwoods.org/library${section}`));
  for (const query of f.queries.filter(query => ['mathematician', 'historyMilestone', 'libraryReference'].includes(query.model))) assert.equal(query.where.status, 'PUBLISHED');
});

test('creation requires a verified account and administration remains protected', async () => {
  for (const file of ['app/library/history/new/page.tsx', 'app/library/mathematicians/new/page.tsx', 'app/library/references/new/page.tsx', 'app/library/contribute/page.tsx']) {
    await assert.rejects(fixture().load(file).default(), /SIGN_IN/);
  }
  const member = { id: 2, role: 'USER', emailVerifiedAt: new Date() };
  assert.equal(permissions.canCreateLibraryEntry(member), true);
  assert.equal(permissions.canEditLibraryReference(member, { status: 'PUBLISHED', createdById: 77 }), false);
  assert.equal(permissions.canArchiveLibraryEntry(member), false);
  assert.equal(permissions.canUseAdminTools(member), false);
  await assert.rejects(fixture(member).load('app/library/eras/page.tsx').default({ searchParams: Promise.resolve({}) }), /ADMIN_GATE/);
});
