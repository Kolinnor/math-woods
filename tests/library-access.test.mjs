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
      requireModerator: async () => { if (!user || !permissions.hasTrustedPrivileges(user.role)) throw Error('TRUSTED_GATE'); return user; },
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


const catalogues = ['app/library/page.tsx','app/library/history/page.tsx','app/library/mathematicians/page.tsx','app/library/references/page.tsx'];
const details = ['app/library/mathematicians/[slug]/page.tsx','app/library/history/[slug]/page.tsx','app/library/references/[slug]/page.tsx','app/library/references/[slug]/history/page.tsx'];
const args = {params:Promise.resolve({slug:'example'}),searchParams:Promise.resolve({})};

test('guests and ordinary verified members cannot read library pages, including direct requests',async()=>{
 for(const user of [null,{id:2,role:'USER',emailVerifiedAt:new Date()}]) {
  for(const file of [...catalogues,...details,'app/library/layout.tsx','app/library/contribute/page.tsx',...['history','mathematicians','references'].flatMap(kind=>[`app/library/${kind}/new/page.tsx`,`app/library/${kind}/[slug]/edit/page.tsx`])]) {
   await assert.rejects(fixture(user,{id:1,slug:'example',status:'PUBLISHED',createdById:2,translations:[]}).load(file).default(args),/TRUSTED_GATE/,file);
  }
  await assert.rejects(fixture(user).load('app/library/mathematicians/[slug]/page.tsx').generateMetadata(args),/TRUSTED_GATE/);
 }
});

test('all trusted roles can render the shared layout and catalogues',async()=>{
 for(const role of ['MODERATOR','ADMIN','OWNER']) for(const file of [...catalogues,'app/library/layout.tsx']) {
  assert.ok(await fixture({id:2,role}).load(file).default(args),`${role}: ${file}`);
 }
});

test('entry visibility still protects other authors drafts from trusted members',async()=>{
 for(const file of details) {
  const f=fixture({id:2,role:'MODERATOR'},{id:1,slug:'private',status:'DRAFT',createdById:77,name:'Private',translations:[]});
  await assert.rejects(f.load(file).default(args),/NOT_FOUND/);
  assert.ok(!f.queries.some(q=>q.model==='libraryReferencePresentationRevision'));
 }
 const f=fixture({id:2,role:'MODERATOR'},{name:'Private',status:'DRAFT',createdById:77,translations:[]});
 assert.equal((await f.load('app/library/mathematicians/[slug]/page.tsx').generateMetadata(args)).title,'Mathematician');
});

test('both catalogue export formats reject guests and ordinary members before querying data',async()=>{
 for(const user of [null,{id:2,role:'USER',emailVerifiedAt:new Date()}]) for(const format of ['json','bibtex']) {
  const f=fixture(user), response=await f.load('app/library/references/export/route.ts').GET(new Request(`https://example.test/library/references/export?format=${format}`));
  assert.equal(response.status,403);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(f.queries.length,0);
 }
 for(const role of ['MODERATOR','ADMIN','OWNER']) {
  const f=fixture({id:2,role}),response=await f.load('app/library/references/export/route.ts').GET(new Request('https://example.test/library/references/export?format=json'));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),[]);
  assert.deepEqual(f.queries[0].where,{status:'PUBLISHED',searchable:true,mergedIntoId:null});
 }
});

test('restricted catalogues are not indexed and era management stays admin-only',async()=>{
 const f=fixture({id:2,role:'MODERATOR'});
 assert.equal((await f.load('app/sitemap.ts').default()).some(item=>item.url.includes('/library')),false);
 assert.equal(f.queries.some(q=>['mathematician','historyMilestone','libraryReference'].includes(q.model)),false);
 assert.deepEqual(f.load('app/library/layout.tsx').metadata.robots,{index:false,follow:false});
 await assert.rejects(f.load('app/library/eras/page.tsx').default(args),/ADMIN_GATE/);
});
