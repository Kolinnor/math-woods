import * as conceptDomains from "../lib/concept-domains.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import * as proofs from '../lib/concept-proofs.ts';
import * as snapshots from '../lib/concept-revisions.ts';
import * as history from '../lib/content-history.ts';
import * as limits from '../lib/content-limits.ts';
import * as additionalLinks from '../lib/additional-concept-links.ts';
import * as citations from '../lib/concept-citations.ts';
import * as feedback from '../lib/form-feedback.ts';

const require = createRequire(import.meta.url);
const source = {
  title: 'Théorème', language: 'fr', bodyMarkdown: 'Énoncé', proofs: [], domainCode: 'other',
  kind: 'THEOREM', status: 'REVIEWED', needsReviewAfterEdit: false, canAppearInConceptBrowser: true,
  translatedFromRevisionId: null, aliases: [], references: [], libraryReferences: [], practiceExercises: [], ...history.contentHistory()
};

import * as translationProperties from "../lib/translation-properties.ts";
import * as map from "../lib/concept-map.ts";
import { conceptMapDomainHidden } from "../lib/concept-map-domains.ts";
function actionFixture(initialDomains = ["algebra"], withSibling = false) {
  let row = { ...source, id: 42, slug: 'theoreme', translationGroupId: 'family', proofs: [], domainCode: initialDomains[0], domainCodes: initialDomains,
    updatedAt: new Date('2026-11-07T12:00:00Z'), createdById: 1, translatedFromConceptId: null };
  let sibling = { ...row, id: 43, slug: "theorem", language: "en" };
  let publish = true, proposal = null;
  const actor = { id: 2, username: 'Contributor', conceptGuideAcknowledgedAt: new Date() };
  const legacy = snapshots.buildConceptRevisionSnapshot(row); delete legacy.domainCodes;
  const revisions = [{ id: 1, markdown: row.bodyMarkdown, conceptTitle: row.title, conceptKind: row.kind, conceptSnapshot: legacy }];
  const links = [];
  const noop = async () => {};
  const db = {
    concept: {
      findUnique: async ({where}) => structuredClone(where.id === 43 ? sibling : row), findMany: async () => withSibling ? [structuredClone(sibling)] : [], findFirst: async () => null,
      update: async ({ where, data }) => { if(where.id === 43) { sibling = {...sibling,...data}; return structuredClone(sibling); } row = { ...row, ...data }; return structuredClone(row); }
    },
    pageRevision: {
      findFirst: async ({ where }) => where.id ? revisions.find(item => item.id === where.id) : revisions.filter(item => (item.pageId ?? 42) === where.pageId).at(-1),
      create: async ({ data }) => { const revision = { id: revisions.length + 1, ...data }; revisions.push(revision); return revision; },
      update: async ({ where, data }) => Object.assign(revisions.find(item => item.id === where.id), data)
    },
    conceptExercise: { deleteMany: noop }, notification: { updateMany: noop },
    conceptEditProposal: {
      findMany: async () => [], findFirst: async () => proposal ? { ...proposal, concept: structuredClone(row), proposer: actor } : null,
      create: async ({ data }) => { proposal = { id: 9, status: 'PENDING', ...data }; return proposal; },
      update: async ({ data }) => { proposal = { ...proposal, ...data }; return proposal; }
    }
  };
  db.$transaction = callback => callback(db);
  const modules = {
    '@prisma/client': require('@prisma/client'),
    'next/navigation': { redirect: href => { throw new Error(`REDIRECT:${href}`); } }, 'next/cache': { revalidatePath: () => {} },
    '@/lib/concept-domains': conceptDomains,
    '@/lib/db': { prisma: db }, '@/lib/auth': { requireVerifiedUser: async () => actor },
    '@/lib/concept-proofs': proofs, '@/lib/concept-revisions': snapshots, '@/lib/content-history': history,
    '@/lib/content-limits': limits, '@/lib/additional-concept-links': additionalLinks,
    '@/lib/form-feedback': feedback, '@/lib/i18n/server': { getInterfaceLocale: async () => 'fr' },
    '@/lib/concept-edit-access': { canPublishConceptEditForConcept: async () => publish },
    '@/lib/rate-limit': { assertRateLimit: noop }, '@/lib/transaction-lock': { acquireTransactionLock: noop },
    '@/lib/permissions': { canProposeConceptEdit: () => true, canUseAdminTools: () => true, canRollbackConcept: () => true },
    '@/lib/languages': { editableContentLanguage: value => value },
    '@/lib/domains': { parseDomainCode: value => value, coarseDomainForCode: () => 'ALGEBRA' },
    '@/lib/concept-kinds': { parseConceptKind: value => value },
    '@/lib/concept-exercises': { parseConceptExerciseIds: () => [] },
    '@/lib/concept-metadata': { parseAliases: () => [], parseReferences: () => [], syncConceptAliases: noop, syncConceptReferences: noop },
    '@/lib/concept-citations': citations,
    '@/lib/problem-citations': { mergeProblemCitations: () => ({ conflict: false }), translatedProblemCitations: () => [] },
    '@/lib/concept-citations-db': { validateConceptCitations: noop, syncConceptCitations: noop },
    '@/lib/citation-draft-receipt': { acknowledgeCitationDraft: noop },
    '@/lib/markdown': { renderMarkdown: async value => value },
    '@/lib/content-slug': { renamedContentSlug: async (_, __, concept) => concept.slug },
    '@/lib/internal-links': { syncInternalLinks: async (_, __, text) => links.push(text), refreshLinksForConcept: noop, refreshLinksForConceptId: noop },
    '@/lib/daily-concept-reviews': { completeDailyConceptReviewForUser: noop },
    '@/lib/translation-properties': translationProperties,
    '@/lib/user-display': { displayNameForUser: () => 'Contributor' },
    '@/lib/notifications': { notifyOwnerOfSiteActivity: noop, notifyConceptAuthor: noop, notifyAdminsOfConceptEditProposal: noop, createNotification: noop },
    '@/lib/translation-routing': { contentLanguageViewHref: (prefix, slug) => `${prefix}/${slug}` }
  };
  const code = ts.transpileModule(readFileSync('lib/actions/concept-actions.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const actions = {};
  new Function('exports', 'require', code)(actions, name => modules[name] ?? {});
  const form = value => {
    const data = new FormData();
    Object.entries({ title: row.title, bodyMarkdown: row.bodyMarkdown, language: 'fr', domain: row.domainCode,
      kind: row.kind, baseUpdatedAt: row.updatedAt.toISOString(), canAppearInConceptBrowser: 'on' }).forEach(([key, item]) => data.set(key, item));
    if (value !== undefined) data.set('conceptProofs', JSON.stringify(value));
    return data;
  };
  return { actions, form, revisions, links, get row() { return row; }, get sibling() { return sibling; }, get proposal() { return proposal; }, setPublish: value => { publish = value; } };
}


function domainsForm(f, codes) { const form=f.form(); form.delete('domain'); codes.forEach(code=>form.append('domains',code)); return form; }

test('ordered domains normalize aliases, deduplicate and reject excessive or malformed submissions',()=>{
 assert.deepEqual(conceptDomains.parseConceptDomains(['ALGEBRA','algebra','general-topology']),['algebra','general-topology']);
 for(const value of [[],null,{},['algebra','general-topology','arithmetic','logic'],[{}]]) assert.throws(()=>conceptDomains.parseConceptDomains(value),conceptDomains.ConceptDomainsValidationError);
 assert.deepEqual(conceptDomains.conceptDomainCodes({domainCode:'algebra'}),['algebra']);
 const old=new FormData();old.set('domain','logic');
 assert.deepEqual(conceptDomains.submittedConceptDomains(old,{domainCode:'algebra',domainCodes:['algebra','arithmetic']}),['logic','arithmetic']);
});

test('saving, promotion and removal propagate domains to translations and record exact snapshots',async()=>{
 const f=actionFixture(['algebra'],true);
 for(const codes of [['algebra','general-topology'],['general-topology','algebra'],['general-topology']]) {
  await assert.rejects(f.actions.updateConceptAction(42,domainsForm(f,codes)),/REDIRECT/);
  assert.deepEqual(f.row.domainCodes,codes);assert.equal(f.row.domainCode,codes[0]);
  assert.deepEqual(f.sibling.domainCodes,codes);assert.equal(f.sibling.domainCode,codes[0]);
  const revision=f.revisions.filter(r=>r.pageId===42).at(-1);
  assert.deepEqual(revision.conceptSnapshot.domainCodes,codes);
 }
 assert.deepEqual(f.revisions[0].conceptSnapshot.domainCodes,['algebra']);
 await assert.rejects(f.actions.rollbackConceptRevisionAction(42,1),/REDIRECT/);
 assert.deepEqual(f.row.domainCodes,['algebra']);assert.deepEqual(f.sibling.domainCodes,['algebra']);
});

test('legacy forms preserve secondary domains and modern invalid submissions cannot write',async()=>{
 const f=actionFixture(['algebra','general-topology']);
 await assert.rejects(f.actions.updateConceptAction(42,f.form()),/REDIRECT/);
 assert.deepEqual(f.row.domainCodes,['algebra','general-topology']);
 const revisions=f.revisions.length;
 await assert.rejects(f.actions.updateConceptAction(42,domainsForm(f,['algebra','arithmetic','logic','general-topology'])),conceptDomains.ConceptDomainsValidationError);
 assert.equal(f.revisions.length,revisions);
});

test('proposed secondary domains remain unpublished until approval and stale proposals are blocked',async()=>{
 const f=actionFixture(['algebra'],true);f.setPublish(false);
 await assert.rejects(f.actions.updateConceptAction(42,domainsForm(f,['algebra','arithmetic'])),/REDIRECT/);
 assert.deepEqual(f.row.domainCodes,['algebra']);assert.deepEqual(f.proposal.snapshot.domainCodes,['algebra','arithmetic']);
 f.setPublish(true);await assert.rejects(f.actions.approveConceptEditProposalAction(9),/REDIRECT/);
 assert.deepEqual(f.row.domainCodes,['algebra','arithmetic']);assert.deepEqual(f.sibling.domainCodes,['algebra','arithmetic']);
 const stale=actionFixture();stale.setPublish(false);
 await assert.rejects(stale.actions.updateConceptAction(42,domainsForm(stale,['algebra','logic'])),/REDIRECT/);
 stale.row.updatedAt=new Date('2026-11-08');stale.row.domainCodes=['algebra','general-topology'];stale.setPublish(true);
 await assert.rejects(stale.actions.approveConceptEditProposalAction(9),/REDIRECT:.*conflict/);
 assert.deepEqual(stale.row.domainCodes,['algebra','general-topology']);
});

test('parent and subdomain filters match secondary domains and preserve legacy classifications',()=>{
 const where=conceptDomains.conceptDomainWhere('algebra');
 assert.ok(where.OR.find(clause=>clause.domainCodes)?.domainCodes.hasSome.includes('algebra-groups'));
 const child=conceptDomains.conceptDomainWhere('algebra-groups');
 assert.ok(child.OR.find(clause=>clause.domainCodes)?.domainCodes.hasSome.includes('algebra-groups'));
 assert.ok(!child.OR.some(clause=>clause.domain));
 assert.ok(where.OR.some(clause=>clause.domain));
});

test('the map retains one node and its primary color but filters and counts all memberships',()=>{
 const rows={concepts:[{...source,id:1,slug:'a',translationGroupId:'a',domainCode:'algebra',domainCodes:['algebra','general-topology'],translatedFromConceptId:null}],redirects:[],links:[]};
 const graph=map.buildConceptMapGraph(rows,'fr');
 assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].domain,'algebra');
 const layout={signature:'test',positions:new Map([['a',{x:0,y:0}]])};
 const payload=map.buildConceptMapPayload(map.prepareConceptMap(graph,layout),1);
 const primary=payload.domains.findIndex(d=>d.code==='algebra'),secondary=payload.domains.findIndex(d=>d.code==='general-topology');
 assert.equal(payload.nodes.domain[0],primary);assert.equal(payload.domains[secondary].count,1);
 assert.equal(conceptMapDomainHidden(payload.nodes,0,new Set([primary])),false);
 assert.equal(conceptMapDomainHidden(payload.nodes,0,new Set([primary,secondary])),true);
 assert.equal(payload.domainMembershipCounts.reduce((sum,g)=>sum+g.count,0),1);
});

test('migration preserves existing primary domains and new rows stay compatible',{skip:!process.env.MW_PGLITE_MODULE},async()=>{
 const {PGlite}=await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);const db=new PGlite();
 try {
  await db.exec(`CREATE TABLE "Concept" (id INT PRIMARY KEY, "domainCode" TEXT NOT NULL DEFAULT 'other', title TEXT); INSERT INTO "Concept" VALUES (1,'algebra','Keep me'),(2,'LOGIC','Legacy');`);
  await db.exec(readFileSync('prisma/migrations/20261107140000_concept_domains/migration.sql','utf8'));
  const {rows}=await db.query('SELECT * FROM "Concept" ORDER BY id');
  assert.deepEqual(rows.map(r=>r.domainCodes),[['algebra'],['LOGIC']]);assert.equal(rows[0].title,'Keep me');
  await db.exec(`INSERT INTO "Concept" (id,title) VALUES (3,'New');`);
  assert.deepEqual((await db.query('SELECT "domainCodes" FROM "Concept" WHERE id=3')).rows[0].domainCodes,[]);
 } finally {await db.close();}
});
