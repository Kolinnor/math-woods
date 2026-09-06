// Editorial corrections documented in docs/reference-audit-2026-09-06.md.
// No writes by default. --apply requires an unchanged snapshot and reviewed plan hash.
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const TABLES = ['libraryReference', 'libraryReferenceTranslation', 'problemLibraryReference', 'conceptLibraryReference', 'conceptReference'];
const canon = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
export const digest = value => createHash('sha256').update(canon(value)).digest('hex');
const json = path => JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const ordered = { orderBy: { id: 'asc' } };

export async function snapshot(db) {
  const data = {};
  for (const table of TABLES) data[table] = await db[table].findMany(ordered);
  data.problem = await db.problem.findMany({ where: { libraryReferences: { some: {} } }, ...ordered,
    select: { id: true, slug: true, language: true, isOriginal: true, bodyMarkdown: true } });
  data.concept = await db.concept.findMany({ where: { libraryReferences: { some: {} } }, ...ordered,
    select: { id: true, slug: true, language: true, bodyMarkdown: true } });
  data.otherUses = await db.libraryReference.findMany({ ...ordered, select: { id: true,
    _count: { select: { milestoneLinks: true, mathematicianWorks: true, featuredIn: true, editions: true } } } });
  return JSON.parse(JSON.stringify(data));
}

const FREE = [2,3,4,8,9,12,14,18,19,20,21,24,26,31,33,34,35,36,37,38,39,40,42,62,5,6];
const PERRIN = [49,51,61,53,56,57,46,47,66,58];
const CALAIS = [64,52,55,65,60,59,50,66,58];
const BLOCKS = [
  { concepts: [417,420,415,413], ids: PERRIN, target: 49, text: 'Daniel Perrin — Cours d’algèbre' },
  { concepts: [412,406,411], ids: CALAIS, target: 64, text: 'Josette Calais — Éléments de théorie des groupes' }
];
const FRAGMENTS = [...new Set([...PERRIN, ...CALAIS])];
const book = (canonicalTitle, authors, publisher, extra = {}) => ({ canonicalTitle, authors, publisher, referenceType: 'BOOK', ...extra });
const EDITS = new Map([
  [1, { canonicalTitle: 'Phil Caldero', referenceType: 'CHANNEL', authors: 'Phil Caldero', url: 'https://www.youtube.com/@philcaldero8964' }],
  [11, book('Finite Group Theory', 'Isaacs, I. Martin', 'American Mathematical Society')],
  [15, { canonicalTitle: 'An Embedding Theorem for Spaces of Convex Sets', authors: 'Rådström, Hans', referenceType: 'ARTICLE',
    journal: 'Proceedings of the American Mathematical Society', year: 1952, volume: '3', issue: '1', pages: '165--169', doi: '10.2307/2032477', url: 'https://www.jstor.org/stable/2032477' }],
  [22, book('Histoire des sciences arabes', null, 'Seuil', { editors: 'Rashed, Roshdi', volume: '2' })],
  [23, book('Oraux X-ENS — Analyse 3', 'Francinou, Serge\nGianella, Hervé\nNicolas, Serge', 'Cassini')],
  [25, { canonicalTitle: 'Professeur Layton et l’étrange village', referenceType: 'OTHER', publisher: 'Nintendo',
    url: 'https://www.nintendo.com/fr-fr/Jeux/Nintendo-DS/Professeur-Layton-et-l-etrange-village-272563.html' }],
  [28, book('Al Moufid en mathématiques — 2 SM A&B — Analyse mathématique', null, 'Dar Attakafa', { volume: 'I' })],
  [30, { canonicalTitle: 'International Mathematical Olympiad 1988 — Problems', referenceType: 'COMPETITION', year: 1988, url: 'https://www.imo-official.org/problems/1988/' }],
  [32, book('Réduction des endomorphismes', 'Mneimné, Rached', 'Calvage & Mounet')],
  [41, { canonicalTitle: 'Théorie des groupes — Devoir surveillé du 12 novembre 2020', referenceType: 'OTHER', publisher: 'Université de Bordeaux', year: 2020,
    url: 'https://www.math.u-bordeaux.fr/~dbenoua/Documents/groupes-DS2020.pdf' }],
  [43, book('Amusements in Mathematics', 'Dudeney, Henry Ernest', null)],
  [45, book('Algebra Can Be Fun', 'Perelman, Yakov Isidorovich', null)],
  // Identify the work without inventing the edition used. Disputed original fields stay in the backup/review note.
  [49, book('Cours d’algèbre', 'Perrin, Daniel', 'Ellipses', { searchable: true, citationKey: 'perrin-cours-algebre' })],
  [54, book('Toute l’analyse de la Licence — Cours et exercices corrigés', 'Escofier, Jean-Pierre', 'Dunod')],
  [63, book('Corps commutatifs et théorie de Galois', 'Tauvel, Patrice', 'Calvage & Mounet')],
  [64, book('Éléments de théorie des groupes', 'Calais, Josette', 'Presses Universitaires de France', { year: 2014, isbn: '9782130633471', searchable: true, citationKey: 'calais2014elements' })]
]);

// Same identity rule as the library form, so later additions find these corrected records.
export function dedupeKey(r) {
  const suffix = [r.edition,r.volume,r.translator].some(Boolean) ? `|edition:${[r.edition,r.volume,r.translator].map(v=>v?.trim().toLowerCase() ?? '').join('|')}` : '';
  if (r.doi) return `doi:${r.doi.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`;
  if (r.isbn) return `isbn:${r.isbn.replace(/[^0-9x]/gi, '').toLowerCase()}`;
  if (r.url) { const url = new URL(r.url); url.hash = ''; return `url:${url.toString().replace(/\/$/, '').toLowerCase()}${suffix}`; }
  return `title:${[r.canonicalTitle,r.authors,r.year].filter(Boolean).join('|').trim().toLowerCase().replace(/\s+/g, ' ')}${suffix}`;
}
const citationTitle = r => [...new Set([r.authors?.split('\n').map(n => n.includes(', ') ? n.split(', ').reverse().join(' ') : n).join(', '), r.canonicalTitle,
  r.volume && r.referenceType === 'BOOK' ? `tome ${r.volume}` : null].filter(Boolean))].join(' — ');
const join = (...parts) => parts.filter(Boolean).join('\n\n') || null;

export function makePlan(before) {
  const state = structuredClone(before), changes = [], creations = [];
  assert.equal(state.libraryReference.length, 66, 'Catalogue changed since audit; review the new inventory first.');
  assert.equal(state.libraryReference.find(r => r.id === 49)?.canonicalTitle, '@book{perrin2004cours,', 'Perrin already changed; do not reapply.');
  assert.equal(state.libraryReference.find(r => r.id === 64)?.canonicalTitle, '@book{calais2014elements,', 'Calais already changed; do not reapply.');
  assert.equal(state.libraryReference.find(r => r.id === 11)?.canonicalTitle, 'Finite Group Theory - Martin Isaacs');
  assert.equal(state.libraryReference.find(r => r.id === 27)?.canonicalTitle, 'I. Martin Isaacs - Finite Group Theory');
  const get = (table,id) => { const r = state[table].find(r=>r.id===id); assert.ok(r, `${table}/${id} missing`); return r; };
  const set = (table,id,data) => Object.assign(get(table,id), data);
  const remove = (table,id) => { get(table,id); state[table] = state[table].filter(r=>r.id!==id); };
  const ref = id => get('libraryReference',id);
  const noOtherUses = id => assert.ok(Object.values(before.otherUses.find(r=>r.id===id)._count).every(n=>n===0), `Unexpected secondary use of reference ${id}`);
  for (const [id, edit] of EDITS) {
    const r = ref(id), old = r.canonicalTitle;
    assert.equal(before.libraryReferenceTranslation.filter(t=>t.referenceId===id).length, 0, `Translation of ${id} needs editorial review`);
    Object.assign(r, edit);
    if (!FRAGMENTS.includes(id)) r.aliases = [...new Set([...r.aliases, old])];
    r.dedupeKey = dedupeKey(r);
  }
  for (const id of FREE) {
    noOtherUses(id);
    ref(id).searchable = false;
    for (const table of ['problemLibraryReference','conceptLibraryReference']) for (const c of state[table].filter(c=>c.referenceId===id)) c.referenceId = null;
  }
  noOtherUses(27);
  ref(27).searchable = false; ref(27).mergedIntoId = 11;
  ref(11).aliases = [...new Set([...ref(11).aliases, ref(27).canonicalTitle])];
  for (const table of ['problemLibraryReference','conceptLibraryReference']) for (const c of state[table].filter(c=>c.referenceId===27)) c.referenceId = 11;

  for (const block of BLOCKS) {
    let original;
    for (const conceptId of block.concepts) {
      const citations = state.conceptLibraryReference.filter(c=>c.conceptId===conceptId).sort((a,b)=>a.position-b.position);
      const legacy = state.conceptReference.filter(c=>c.conceptId===conceptId).sort((a,b)=>a.position-b.position);
      assert.deepEqual(citations.map(c=>c.referenceId), block.ids, `Unexpected citations on concept ${conceptId}`);
      assert.deepEqual(legacy.map(c=>c.title), citations.map(c=>c.text), `Legacy mirror differs on concept ${conceptId}`);
      for (const c of citations) {
        assert.equal(c.text, before.libraryReference.find(r=>r.id===c.referenceId).canonicalTitle);
        assert.ok(!c.note && !c.locator && !c.url, `New citation details on concept ${conceptId}; preserve them manually`);
        assert.equal(c.role, 'FURTHER_READING');
      }
      const raw = legacy.map(c=>c.title).join('\n');
      if (original) assert.equal(raw, original); else original = raw;
      // Keep the first citation's stable key; the old UI has no inline citation-key syntax.
      const first = citations[0];
      set('conceptLibraryReference', first.id, { text: block.text, referenceId: block.target, position: 0 });
      for (const c of citations.slice(1)) remove('conceptLibraryReference',c.id);
      set('conceptReference', legacy[0].id, { title: block.text, position: 0 });
      for (const c of legacy.slice(1)) remove('conceptReference',c.id);
    }
    ref(block.target).reviewNote = join(ref(block.target).reviewNote,
      'Correction bibliographique du 2026-09-06. Bloc hérité reconstitué ci-dessous. Les champs structurés vérifiés priment ; ce bloc reste une archive, pas un import à réappliquer.',
      block.target === 49 ? 'EDP Sciences / 2004 / ISBN 9782868836977 non corroborés. Ouvrage identifié chez Ellipses ; édition utilisée inconnue.' : 'Notice Calais : PUF, 2014, ISBN 9782130633471 concordants.', original);
    // Never make the disputed Perrin BibTeX active again. Calais can retain its verified source.
    if (block.target === 64) ref(64).bibtex = original;
  }
  for (const id of FRAGMENTS.filter(id=>![49,64].includes(id))) {
    noOtherUses(id);
    assert.ok(!state.conceptLibraryReference.some(c=>c.referenceId===id) && !state.problemLibraryReference.some(c=>c.referenceId===id));
    ref(id).searchable = false;
    if (![58,66].includes(id)) ref(id).mergedIntoId = PERRIN.includes(id) ? 49 : 64;
    else ref(id).status = 'ARCHIVED';
  }

  // Verified YouTube oEmbed responses on 2026-09-06, for URLs already present in notes.
  const videos = [
    [-1, 'iB34oGdCiuo', "Une preuve d’irréductibilité par localisation des racines", [149]],
    [-2, 'k8Iz5b7cz1g', 'Oral des Mines: une équation diophantienne', [678,486]],
    [-3, 'RiYMeW4YYYA', 'Un scoop sur la caractérisation des sous-groupes distingués (par Paul Broussous)', [402]],
    [-4, '8ynDBMqyMyE', 'Le corps C est algébriquement clos. Ma preuve coup de cœur!', [447]]
  ];
  const createRef = (id, data) => {
    const r = { id, ...data, status: 'PUBLISHED', searchable: true, bibliographyVersion: 1, dedupeKey: dedupeKey(data) };
    state.libraryReference.push(r); creations.push({ table:'libraryReference', id, data: Object.fromEntries(Object.entries(r).filter(([k])=>k!=='id')) });
  };
  for (const [id, video, canonicalTitle, problems] of videos) {
    createRef(id, { slug:`phil-caldero-${video.toLowerCase()}`, canonicalTitle, authors:'Phil Caldero', referenceType:'VIDEO', url:`https://www.youtube.com/watch?v=${video}` });
    for (const problemId of problems) {
      const c = state.problemLibraryReference.find(c=>c.problemId===problemId && c.referenceId===1);
      assert.ok(c?.note?.includes(video), `Video source changed on ${problemId}`);
      c.referenceId = id; c.url = ref(id).url;
    }
  }
  createRef(-5, { slug:'rotman-an-introduction-to-the-theory-of-groups', ...book('An Introduction to the Theory of Groups', 'Rotman, Joseph J.', null) });
  const videoCitation = state.problemLibraryReference.find(c=>c.problemId===402 && c.referenceId===-3);
  assert.ok(videoCitation.note.includes('Rotman, An Introduction to the Theory of Groups'));
  assert.ok(!state.problemLibraryReference.some(c=>c.problemId===402 && c.citationKey==='audit-20260906-rotman'));
  const rotman = { problemId:402, referenceId:-5, citationKey:'audit-20260906-rotman', text:'Joseph J. Rotman — An Introduction to the Theory of Groups', url:null,
    locator:'Exercice 2.32, p. 31', note:null, role:videoCitation.role, spoiler:videoCitation.spoiler, isPrimary:false,
    position:Math.max(...state.problemLibraryReference.filter(c=>c.problemId===402).map(c=>c.position))+1 };
  creations.push({table:'problemLibraryReference',id:-1,data:rotman}); state.problemLibraryReference.push({id:-1,...rotman});

  for (const table of ['problemLibraryReference','conceptLibraryReference']) for (const c of state[table]) {
    if (c.referenceId !== null && (EDITS.has(c.referenceId) || c.referenceId < 0)) {
      c.text = citationTitle(ref(c.referenceId));
      if (ref(c.referenceId).url && !c.url) c.url = ref(c.referenceId).url;
    }
  }
  const byProblem = id => { const c = state.problemLibraryReference.find(c=>c.problemId===id); assert.ok(c); return c; };
  const passage = (id, text) => { const c=byProblem(id); c.locator=[c.locator,text].filter(Boolean).join(' · '); };
  passage(442,'Énigme 037'); passage(470,'Exercice 1');
  passage(454,'Problème 6'); passage(455,'Problem 6');
  assert.equal(byProblem(642).note,'Chap. 9');
  passage(642,'Chapitre 9'); byProblem(642).note=null;
  assert.equal(byProblem(627).note,'Proposition 13.7.A. page 73');
  passage(627,'Proposition 13.7.A, page 73'); byProblem(627).note=null;
  // Preserve the rest of the adaptation note, removing only the unsupported publication date.
  assert.ok(byProblem(523).note?.includes(' publié dans les années 1920'));
  byProblem(523).note = byProblem(523).note.replace(' publié dans les années 1920', '');
  for (const c of state.conceptLibraryReference.filter(c=>c.conceptId===449 && c.referenceId===54)) {
    assert.equal(c.note,'Chapitre 16 page 532'); assert.equal(c.locator,null);
    c.locator='Chapitre 16, page 532'; c.note=null;
  }
  for (const c of state.conceptLibraryReference.filter(c=>c.conceptId===451 && c.referenceId===63)) { assert.equal(c.note,'Patrice Tauvel'); c.note=null; }

  // Synchronize the existing legacy rows in place, retaining their IDs and timestamps.
  for (const c of state.conceptLibraryReference) {
    const original = before.conceptLibraryReference.find(r=>r.id===c.id);
    if (canon(c)===canon(original)) continue;
    const mirror = state.conceptReference.find(r=>r.conceptId===c.conceptId && r.position===c.position)
      ?? state.conceptReference.find(r=>r.conceptId===c.conceptId && r.position===original.position);
    assert.ok(mirror, `Missing legacy mirror for citation ${c.id}`);
    Object.assign(mirror,{ title:c.text,url:c.url,note:join(c.locator,c.note),position:c.position });
  }
  for (const table of TABLES) for (const old of before[table]) {
    const next=state[table].find(r=>r.id===old.id);
    if (!next) changes.push({table,id:old.id,action:'delete',before:old});
    else {
      const data=Object.fromEntries(Object.entries(next).filter(([key,value])=>canon(value)!==canon(old[key])));
      if (Object.keys(data).length) changes.push({table,id:old.id,action:'update',before:old,data});
    }
  }
  // Catch same-page duplicate resources, accidental content loss, or a plan that leaves fragments live.
  for (const table of ['problemLibraryReference','conceptLibraryReference']) {
    const keys=new Set();
    for (const c of state[table]) {
      const owner=c.problemId ?? c.conceptId;
      const key=`${owner}:${c.referenceId}`;
      if (c.referenceId!==null) { assert.ok(!keys.has(key),`Duplicate citation ${key}`); keys.add(key); }
      assert.ok(c.text && !/^\s*(?:@\w+\s*[{(]|(?:author|title|year|publisher|isbn|address|series|language)\s*=|[{}]\s*$)/i.test(c.text),`Unrepaired citation ${c.id}`);
    }
  }
  assert.equal(state.problemLibraryReference.length,before.problemLibraryReference.length+1);
  assert.equal(state.conceptLibraryReference.length,before.conceptLibraryReference.length-60);
  assert.equal(state.conceptReference.length,before.conceptReference.length-60);
  assert.equal(new Set(state.libraryReference.map(r=>r.dedupeKey)).size,state.libraryReference.length,'Duplicate bibliography identity');
  return { version:1, snapshotHash:digest(before), changes, creations, summary:{ referencesUpdated:changes.filter(c=>c.table==='libraryReference').length,
    referencesCreated:5, problemCitations:state.problemLibraryReference.length, conceptCitations:state.conceptLibraryReference.length,
    searchable:state.libraryReference.filter(r=>r.searchable&&!r.mergedIntoId&&r.status==='PUBLISHED').length,
    freeProblemCitations:state.problemLibraryReference.filter(c=>c.referenceId===null).length,
    freeConceptCitations:state.conceptLibraryReference.filter(c=>c.referenceId===null).length } };
}

export async function applyPlan(db, plan, before) {
  assert.equal(plan.snapshotHash,digest(before),'Snapshot hash mismatch');
  assert.equal(digest(plan),digest(makePlan(before)),'Plan was modified independently of the reviewed rules');
  return db.$transaction(async tx => {
    // Read requests remain available; edits to bibliography wait for this short transaction.
    await tx.$executeRawUnsafe('LOCK TABLE "LibraryReference", "LibraryReferenceTranslation", "ProblemLibraryReference", "ConceptLibraryReference", "ConceptReference" IN SHARE ROW EXCLUSIVE MODE');
    const current=await snapshot(tx);
    assert.equal(digest(current),digest(before),'Production changed since preview; no changes applied');
    const ids=new Map(), resolveData=data=> {
      if (data.referenceId<0) { assert.ok(ids.has(data.referenceId),'Unresolved new reference'); return {...data,referenceId:ids.get(data.referenceId)}; }
      return {...data};
    };
    for (const item of plan.creations.filter(c=>c.table==='libraryReference')) {
      const created=await tx.libraryReference.create({data:item.data}); ids.set(item.id,created.id);
    }
    for (const item of plan.changes.filter(c=>c.action==='delete')) await tx[item.table].delete({where:{id:item.id}});
    for (const item of plan.changes.filter(c=>c.action==='update')) await tx[item.table].update({where:{id:item.id},data:resolveData(item.data)});
    const createdCitations=[];
    for (const item of plan.creations.filter(c=>c.table!=='libraryReference')) createdCitations.push(await tx[item.table].create({data:resolveData(item.data)}));
    const after=await snapshot(tx);
    for (const item of plan.creations.filter(c=>c.table==='libraryReference')) {
      const row=after.libraryReference.find(r=>r.id===ids.get(item.id));
      for (const [key,value] of Object.entries(item.data)) assert.deepEqual(row[key],value,`Created reference ${item.id}/${key}`);
    }
    for (const item of plan.changes) {
      const row=after[item.table].find(r=>r.id===item.id);
      if (item.action==='delete') assert.ok(!row);
      else for (const [key,value] of Object.entries(resolveData(item.data))) assert.deepEqual(row[key],value,`${item.table}/${item.id}/${key}`);
    }
    // Every untouched field of every original row must still be identical, including notes, roles and privacy.
    for (const table of TABLES) for (const old of before[table]) {
      const change=plan.changes.find(c=>c.table===table&&c.id===old.id);
      if (change?.action==='delete') continue;
      const row=after[table].find(r=>r.id===old.id);
      for (const [key,value] of Object.entries(old)) if (key!=='updatedAt' && !(key in (change?.data ?? {}))) assert.deepEqual(row[key],value,`Unplanned change ${table}/${old.id}/${key}`);
    }
    assert.deepEqual(after.problem,before.problem,'Problem content or Original flag changed');
    assert.deepEqual(after.concept,before.concept,'Concept content changed');
    assert.equal(after.problemLibraryReference.length,plan.summary.problemCitations);
    assert.equal(after.conceptLibraryReference.length,plan.summary.conceptCitations);
    assert.equal(after.conceptReference.length,plan.summary.conceptCitations);
    return { planHash:digest(plan), summary:plan.summary, createdReferences:Object.fromEntries(ids), createdCitations:createdCitations.map(c=>c.id), after };
  },{isolationLevel:'Serializable',timeout:60_000});
}

async function main() {
  const args=process.argv.slice(2), mode=args[0];
  const db=new PrismaClient();
  try {
    if (mode==='--snapshot') console.log(JSON.stringify(await db.$transaction(tx=>snapshot(tx),{isolationLevel:'RepeatableRead'})));
    else if (mode==='--plan' && args.length===2) { const plan=makePlan(json(args[1])); console.log(JSON.stringify({...plan,planHash:digest(plan)},null,2)); }
    else if (mode==='--apply' && args.length===4) {
      const before=json(args[1]),plan=makePlan(before);
      assert.equal(args[2],digest(plan),'Reviewed plan hash does not match');
      // Fail before the transaction if the exclusive receipt file cannot be written. Never overwrite a receipt.
      writeFileSync(args[3],JSON.stringify({state:'prepared',planHash:digest(plan)}),{flag:'wx',mode:0o600});
      const result=await applyPlan(db,plan,before);
      writeFileSync(args[3],JSON.stringify({state:'applied',...result},null,2),{mode:0o600});
      console.log(JSON.stringify({applied:true,planHash:result.planHash,summary:result.summary,createdReferences:result.createdReferences}));
    } else throw new Error('Usage: --snapshot | --plan snapshot.json | --apply snapshot.json reviewed-hash receipt.json');
  } finally { await db.$disconnect(); }
}
if (process.argv.slice(2).some(a=>['--snapshot','--plan','--apply'].includes(a))) main().catch(error=>{console.error(error);process.exitCode=1;});
