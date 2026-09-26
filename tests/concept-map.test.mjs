import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as conceptMap from '../lib/concept-map.ts';
import * as layoutModule from '../lib/concept-map-layout.ts';
import * as text from '../lib/concept-map-text.ts';
import * as view from '../lib/concept-browser-view.ts';
import * as languages from '../lib/languages.ts';
import * as permissions from '../lib/permissions.ts';

test('map API authorizes every request before reading data or returning an ETag response', async () => {
  const source = ts.transpileModule(readFileSync(new URL('../app/api/concepts/map/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  let user = null, reads = 0;
  const context = { exports: {}, URL, Response, require: name => ({
    '@/lib/auth': { getCurrentUser: async () => user },
    '@/lib/permissions': permissions,
    '@/lib/languages': languages,
    '@/lib/concept-map-data': { CONCEPT_MAP_MAX_TIER: 10, getConceptMapResponse: async () => {
      reads++; return { body: '{"nodes":[]}', etag: '"fixture"', provisional: false };
    } }
  })[name] };
  vm.runInNewContext(source, context);
  const request = etag => new Request('http://localhost/api/concepts/map?lang=fr&tier=2', {
    headers: etag ? { 'If-None-Match': '"fixture"' } : {}
  });
  for(const role of [null, 'USER', 'MODERATOR', 'ADMIN', 'OWNER']) {
    user = role ? { id: 1, role } : null;
    const allowed = role === 'ADMIN' || role === 'OWNER';
    for(const etag of [false,true]) {
      const before = reads;
      const response = await context.exports.GET(request(etag));
      assert.equal(response.status, allowed ? (etag ? 304 : 200) : role ? 403 : 401);
      assert.equal(reads - before, allowed ? 1 : 0);
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
      assert.match(response.headers.get('Vary'), /Cookie/);
    }
  }
  user = null;
  assert.equal((await context.exports.GET(request(true))).status,401,'logging out cannot reuse the admin ETag');
});

const { buildConceptMapGraph, buildConceptMapPayload, conceptMapLevels, conceptMapStructureSignature, prepareConceptMap } = conceptMap;
const { computeConceptMapLayout, approximateConceptMapLayout } = layoutModule;

let nextId = 1;
function concept(slug, overrides = {}) {
  return {
    id: nextId++, slug, title: slug, language: 'fr', translationGroupId: `g-${slug}`,
    translatedFromConceptId: null, status: 'USABLE', kind: 'DEFINITION', domainCode: 'algebra', aliases: [], ...overrides
  };
}
const link = (source, targetSlug) => ({ sourceId: source.id, targetSlug });
const emptyLayout = { signature: 'test', positions: new Map() };

function seededRandom(seed) {
  let state = seed;
  return () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('labels approximate LaTeX with Unicode and search ignores case, accents and markup', () => {
  assert.equal(text.conceptMapLabel('Groupe $\\mathbb{Z}/n\\mathbb{Z}$'), 'Groupe ℤ/nℤ');
  assert.equal(text.conceptMapLabel('Espace $L^p$'), 'Espace Lᵖ');
  assert.equal(text.conceptMapLabel('Groupe fondamental $\\pi_1$'), 'Groupe fondamental π₁');
  assert.equal(text.conceptMapLabel('Groupe $\\mathrm{SL}_2(\\mathbb{R})$'), 'Groupe SL₂(ℝ)');
  assert.equal(text.conceptMapLabel('Formule $e^{i\\pi} + 1 = 0$'), 'Formule e^(iπ) + 1 = 0');
  assert.equal(text.conceptMapLabel("**Relation** d'équivalence"), 'Relation d’équivalence');
  assert.equal(text.conceptMapLabel('[[Groupe|groupes]] et `code`'), 'groupes et code');
  assert.equal(text.conceptTitleNeedsRichRendering('Espace $L^p$'), true);
  assert.equal(text.conceptTitleNeedsRichRendering('Compacité'), false);
  assert.equal(text.normalizeConceptMapSearch('  Compacité de L’espace ℝ '), "compacite de l'espace r");
  assert.equal(text.normalizeConceptMapSearch('L^p'), text.normalizeConceptMapSearch(text.conceptMapLabel('$L^p$')));
});

test('the Map/List choice: explicit parameter, then remembered cookie, then the map', () => {
  assert.equal(view.resolveConceptBrowserView(undefined, undefined), 'map');
  assert.equal(view.resolveConceptBrowserView(undefined, 'list'), 'list');
  assert.equal(view.resolveConceptBrowserView('map', 'list'), 'map');
  assert.equal(view.resolveConceptBrowserView(['list', 'map'], 'map'), 'list');
  assert.equal(view.resolveConceptBrowserView('graph', 'nonsense'), 'map');
  assert.equal(view.conceptBrowserViewHref('map', 'q=groupe'), '/concepts?view=map');
  const listHref = new URL(view.conceptBrowserViewHref('list', 'q=groupe&page=3&view=map&language=fr&language=en'), 'https://example.test');
  assert.equal(listHref.searchParams.get('view'), 'list');
  assert.equal(listHref.searchParams.get('q'), 'groupe');
  assert.equal(listHref.searchParams.has('page'), false);
  assert.deepEqual(listHref.searchParams.getAll('language'), ['fr', 'en']);
  assert.match(view.conceptBrowserViewCookie('list', true), /^math-woods-concepts-view=list; Max-Age=31536000; Path=\/; SameSite=Lax; Secure$/);
  assert.equal(view.conceptMapDataHref('fr', 2), '/api/concepts/map?lang=fr&tier=2');
});

test('a map only shows the pages of its language, with their own citations resolved like links', () => {
  const groupe = concept('groupe');
  const group = concept('group', { language: 'en', translationGroupId: groupe.translationGroupId, translatedFromConceptId: groupe.id, title: 'Group' });
  const anneau = concept('anneau', { aliases: [{ alias: 'Anneau unitaire', aliasSlug: 'anneau-unitaire' }] });
  const corps = concept('corps-commutatif');
  const ideal = concept('ideal', { domainCode: 'algebra-rings' });
  const onlyEnglish = concept('field-extension', { language: 'en', title: 'Field extension' });
  const placeholder = concept('placeholder', { status: 'MISSING' });
  const spanish = concept('grupo', { language: 'es' });
  const hiddenSibling = concept('module-fr', { status: 'MISSING' });
  const visibleSibling = concept('module', { language: 'en', translationGroupId: hiddenSibling.translationGroupId });
  const rows = {
    concepts: [groupe, group, anneau, corps, ideal, onlyEnglish, placeholder, spanish, hiddenSibling, visibleSibling],
    redirects: [
      { sourceSlug: 'corps', targetConceptId: corps.id, isRename: true },
      { sourceSlug: 'anneau-doublon', targetConceptId: anneau.id, isRename: false }
    ],
    links: [
      link(groupe, 'anneau'), link(group, 'anneau-unitaire'), // the English page cites a concept with no English page
      link(anneau, 'corps'), // renamed concept
      link(ideal, 'anneau-doublon'), // merged duplicate
      link(ideal, 'group'), // slug of another translation: points to the French page
      link(corps, 'groupe'), link(groupe, 'corps-commutatif'), // mutual citation
      link(groupe, 'group'), // self-citation through a translation
      link(corps, 'absent'), // missing concept
      link(placeholder, 'groupe'), link(spanish, 'groupe'), // hidden sources
      link(corps, 'module-fr'), // only a placeholder in French
      link(onlyEnglish, 'ideal'), link(onlyEnglish, 'ideal'), // no English page for "ideal"
      link(onlyEnglish, 'groupe'), link(visibleSibling, 'field-extension')
    ]
  };

  const french = buildConceptMapGraph(rows, 'fr');
  assert.equal(french.language, 'fr');
  assert.deepEqual(french.nodes.map((node) => node.concept.slug).sort(), ['anneau', 'corps-commutatif', 'groupe', 'ideal']);
  assert.ok(french.nodes.every((node) => node.concept.language === 'fr'), 'never a page of another language');
  const name = (graph, index) => graph.nodes[index].concept.slug;
  const citations = (graph) => graph.citations.map(([source, target]) => `${name(graph, source)}>${name(graph, target)}`).sort();
  assert.deepEqual(citations(french), [
    'anneau>corps-commutatif', 'corps-commutatif>groupe', 'groupe>anneau', 'groupe>corps-commutatif', 'ideal>anneau', 'ideal>groupe'
  ]);

  const english = buildConceptMapGraph(rows, 'en');
  assert.deepEqual(english.nodes.map((node) => node.concept.slug).sort(), ['field-extension', 'group', 'module']);
  assert.deepEqual(citations(english), ['field-extension>group', 'module>field-extension']);
  assert.equal(buildConceptMapGraph(rows, 'es').language, 'es');
  assert.equal(buildConceptMapGraph(rows, 'es').nodes.length, 0, 'an inactive language has no map');

  const payload = buildConceptMapPayload(prepareConceptMap(french, emptyLayout), 1);
  assert.equal(payload.language, 'fr');
  assert.equal(payload.tier, 1);
  assert.equal(payload.offset, 0);
  assert.deepEqual(payload.total, { nodes: 4, links: 5 }); // groupe and corps cite each other: one line
  assert.deepEqual(payload.tiers, [{ end: 4, level: 0 }]);
  assert.equal(payload.maxLevel, 0);
  // Most cited first, so that tier 1 and the overview hold the most useful concepts.
  assert.deepEqual(payload.nodes.slug, ['groupe', 'anneau', 'corps-commutatif', 'ideal']);
  assert.deepEqual(payload.nodes.level, [0, 0, 0, 0]);
  assert.deepEqual(payload.nodes.degree, [3, 3, 2, 2]);
  assert.equal(payload.nodes.label.join('|'), 'groupe|anneau|corps-commutatif|ideal');
  assert.match(payload.nodes.terms[0], /(^|\n)group($|\n)/, 'the search also finds the titles of other translations');
  assert.match(payload.nodes.terms[1], /anneau unitaire/);
  assert.equal(payload.links.length, french.citations.length * 2);
  const corpsIndex = payload.nodes.slug.indexOf('corps-commutatif');
  const cited = [];
  for (let index = 0; index < payload.links.length; index += 2) {
    if (payload.links[index] === corpsIndex) cited.push(payload.nodes.slug[payload.links[index + 1]]);
  }
  assert.deepEqual(cited, ['groupe']);
  assert.deepEqual(payload.domains.map((domain) => domain.code), ['algebra']);
  assert.deepEqual(payload.nodes.domain, [0, 0, 0, 0]);

  const rest = buildConceptMapPayload(prepareConceptMap(french, emptyLayout), 2);
  assert.equal(rest.offset, 4);
  assert.deepEqual(rest.nodes.slug, []);
  assert.deepEqual(rest.links, []);
});

test('a rename redirect wins over a live slug, like on the concept page', () => {
  const oldTarget = concept('ancien');
  const renamed = concept('nouveau');
  const source = concept('source');
  const graph = buildConceptMapGraph({
    concepts: [oldTarget, renamed, source],
    redirects: [{ sourceSlug: 'ancien', targetConceptId: renamed.id, isRename: true }],
    links: [link(source, 'ancien')]
  }, 'fr');
  assert.deepEqual(graph.citations.map(([from, to]) => [graph.nodes[from].id, graph.nodes[to].id]), [[source.translationGroupId, renamed.translationGroupId]]);
});

function syntheticRows(size, seed = 7, language = 'fr') {
  const random = seededRandom(seed);
  const domains = ['algebra', 'linear-algebra', 'general-topology', 'real-analysis', 'probability-statistics', 'arithmetic'];
  const concepts = Array.from({ length: size }, (_, index) => concept(`n-${size}-${seed}-${index}`, { domainCode: domains[index % domains.length], language }));
  const links = [];
  concepts.forEach((source, index) => {
    const count = Math.floor(random() * 4);
    for (let citation = 0; citation < count; citation += 1) {
      const sameDomain = random() < 0.75;
      // Early concepts are cited more often, like foundational notions.
      let target = Math.floor(random() * random() * size);
      if (sameDomain) target = (Math.floor(target / domains.length) * domains.length + (index % domains.length)) % size;
      if (target !== index) links.push(link(source, concepts[target].slug));
    }
  });
  return { concepts, redirects: [], links };
}

test('levels of detail keep the overview within budget and reveal every concept when zooming in', () => {
  const random = seededRandom(3);
  const count = 20000;
  const positions = Array.from({ length: count }, () => ({ x: random() * 2000 - 1000, y: random() * 2000 - 1000 }));
  const importance = Array.from({ length: count }, () => Math.floor(random() * random() * 60));
  const { levels, maxLevel } = conceptMapLevels(positions, importance, { overviewBudget: 1500 });
  const shown = (level) => levels.filter((value) => value <= level).length;
  assert.ok(maxLevel >= 2 && maxLevel <= 8, `maxLevel ${maxLevel}`);
  assert.ok(shown(0) <= 1500 && shown(0) >= 300, `overview holds ${shown(0)} concepts`);
  for (let level = 1; level <= maxLevel; level += 1) assert.ok(shown(level) >= shown(level - 1));
  assert.equal(shown(maxLevel), count);
  // The most important concept of the map is always on the overview.
  const top = importance.indexOf(Math.max(...importance));
  assert.equal(levels[top], 0);
  // A small map is drawn whole at every zoom.
  assert.deepEqual(conceptMapLevels(positions.slice(0, 40), importance.slice(0, 40)), { levels: Array(40).fill(0), maxLevel: 0 });
});

test('a large map is delivered in tiers: the overview first, then one zoom level at a time', () => {
  const rows = syntheticRows(6000, 17);
  const graph = buildConceptMapGraph(rows, 'fr');
  const random = seededRandom(5);
  const layout = { signature: 'fake', positions: new Map(graph.nodes.map((node) => [node.id, { x: random() * 2000 - 1000, y: random() * 2000 - 1000 }])) };
  const prepared = prepareConceptMap(graph, layout, { tierBudget: 3000 });
  const { tiers } = prepared;
  assert.ok(prepared.maxLevel > 0 && tiers.length >= 2, JSON.stringify(tiers));
  assert.equal(tiers.at(-1).end, 6000);
  assert.ok(tiers.every((tier, index) => index === 0 || (tier.end > tiers[index - 1].end && tier.level > tiers[index - 1].level)), 'no empty tier');
  assert.ok(tiers[0].end <= 3000 || tiers[0].level === 0, 'the first tier stays within budget');
  const payloads = tiers.map((_, index) => buildConceptMapPayload(prepared, index + 1));
  let offset = 0;
  const seen = new Set();
  let linkCount = 0;
  payloads.forEach((payload, index) => {
    assert.equal(payload.tier, index + 1);
    assert.equal(payload.offset, offset);
    assert.equal(payload.nodes.slug.length, tiers[index].end - offset);
    // Whole levels: every concept of this tier is deeper than the previous tiers, and a tier
    // brings every concept of its levels.
    const previousLevel = index ? tiers[index - 1].level : -1;
    assert.ok(payload.nodes.level.every((level) => level > previousLevel && level <= tiers[index].level));
    // A link comes with the later of its two ends: once tiers 1…k are there, all their links are.
    for (let position = 0; position < payload.links.length; position += 2) {
      const later = Math.max(payload.links[position], payload.links[position + 1]);
      assert.ok(later >= offset && later < tiers[index].end);
    }
    for (const key of Object.keys(payload.nodes.terms)) assert.ok(Number(key) >= offset && Number(key) < tiers[index].end, 'sparse columns use global indexes');
    payload.nodes.slug.forEach((slug) => seen.add(slug));
    linkCount += payload.links.length;
    offset = tiers[index].end;
    assert.deepEqual(payload.bounds, payloads[0].bounds);
    assert.deepEqual(payload.tiers, tiers);
  });
  assert.equal(seen.size, 6000);
  assert.equal(linkCount, graph.citations.length * 2, 'every citation is sent exactly once');
  const beyond = buildConceptMapPayload(prepared, tiers.length + 1);
  assert.equal(beyond.offset, 6000);
  assert.deepEqual(beyond.nodes.slug, []);
  assert.deepEqual(beyond.links, []);
  assert.equal(buildConceptMapPayload(prepared, 1).version, 'fake');
  assert.equal(buildConceptMapPayload(prepareConceptMap(graph, { ...layout, provisional: true }), 1).version, 'fake~p', 'provisional tiers are never mixed with final ones');
});

test('the layout is deterministic, independent of slicing, and keeps every concept on the map', async () => {
  const rows = syntheticRows(180);
  const graph = buildConceptMapGraph(rows, 'fr');
  const first = await computeConceptMapLayout(graph);
  const shuffled = buildConceptMapGraph({ ...rows, concepts: [...rows.concepts].reverse(), links: [...rows.links].reverse() }, 'fr');
  const second = await computeConceptMapLayout(shuffled, { yieldControl: () => new Promise((resolve) => setImmediate(resolve)), sliceBudgetMs: 0 });
  assert.equal(first.signature, second.signature);
  assert.equal(first.positions.size, graph.nodes.length);
  for (const [id, position] of first.positions) {
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
    assert.deepEqual(second.positions.get(id), position);
    assert.ok(Math.hypot(position.x, position.y) < 1600, `${id} stays near the map`);
  }
  // Concepts of the same domain are closer to each other than to other domains on average.
  const byDomain = new Map();
  for (const node of graph.nodes) byDomain.set(node.domain, [...(byDomain.get(node.domain) ?? []), first.positions.get(node.id)]);
  const centroid = (points) => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
  const spread = [...byDomain.values()].map((points) => { const c = centroid(points); return points.reduce((sum, p) => sum + Math.hypot(p.x - c.x, p.y - c.y), 0) / points.length; });
  const centroids = [...byDomain.values()].map(centroid);
  const separation = centroids.flatMap((a, i) => centroids.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)));
  assert.ok(Math.min(...separation) > 0.5 * (spread.reduce((a, b) => a + b, 0) / spread.length), 'domains form distinct regions');
});

test('beyond the skeleton, concepts are placed next to what they cite, deterministically', async () => {
  const rows = syntheticRows(600, 23);
  const graph = buildConceptMapGraph(rows, 'fr');
  const options = { skeletonSize: 120 };
  const first = await computeConceptMapLayout(graph, options);
  const second = await computeConceptMapLayout(graph, { ...options, yieldControl: () => new Promise((resolve) => setImmediate(resolve)), sliceBudgetMs: 0 });
  assert.equal(first.positions.size, 600);
  for (const [id, position] of first.positions) {
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
    assert.deepEqual(second.positions.get(id), position);
  }
  const at = (index) => first.positions.get(graph.nodes[index].id);
  const distance = (a, b) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
  const linked = graph.citations.map(([source, target]) => distance(source, target));
  const random = seededRandom(9);
  const unrelated = Array.from({ length: linked.length }, () => distance(Math.floor(random() * 600), Math.floor(random() * 600)));
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(mean(linked) < 0.6 * mean(unrelated), `linked ${mean(linked)} vs unrelated ${mean(unrelated)}`);
  // No two concepts share a spot.
  const spots = new Set([...first.positions.values()].map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`));
  assert.ok(spots.size > 590);
});

test('a small edit only moves the map a little, and the placeholder layout keeps known positions', async () => {
  const rows = syntheticRows(150, 11);
  const before = await computeConceptMapLayout(buildConceptMapGraph(rows, 'fr'));
  const added = concept('nouveau-concept', { domainCode: 'algebra' });
  const editedRows = { ...rows, concepts: [...rows.concepts, added], links: [...rows.links, link(added, rows.concepts[0].slug), link(added, rows.concepts[6].slug)] };
  const editedGraph = buildConceptMapGraph(editedRows, 'fr');
  const after = await computeConceptMapLayout(editedGraph);
  assert.notEqual(before.signature, after.signature);
  const moves = [...before.positions].map(([id, point]) => Math.hypot(after.positions.get(id).x - point.x, after.positions.get(id).y - point.y)).sort((a, b) => a - b);
  assert.ok(moves[Math.floor(moves.length / 2)] < 120, `median move ${moves[Math.floor(moves.length / 2)]} should stay small on a ±1000 map`);

  const provisional = approximateConceptMapLayout(editedGraph, before);
  assert.equal(provisional.provisional, true);
  assert.equal(provisional.signature, after.signature);
  for (const [id, point] of before.positions) assert.deepEqual(provisional.positions.get(id), point);
  const placed = provisional.positions.get(added.translationGroupId);
  const neighbors = [rows.concepts[0], rows.concepts[6]].map((item) => before.positions.get(item.translationGroupId));
  const middle = { x: (neighbors[0].x + neighbors[1].x) / 2, y: (neighbors[0].y + neighbors[1].y) / 2 };
  assert.ok(Math.hypot(placed.x - middle.x, placed.y - middle.y) < 60, 'a new concept appears next to what it cites');
});

test('the structure signature ignores titles, statuses and citation direction, not the language', () => {
  const rows = syntheticRows(40, 3);
  const signature = conceptMapStructureSignature(buildConceptMapGraph(rows, 'fr'));
  const retitled = { ...rows, concepts: rows.concepts.map((item) => ({ ...item, title: `${item.title}!`, status: 'STUB' })) };
  assert.equal(conceptMapStructureSignature(buildConceptMapGraph(retitled, 'fr')), signature);
  const [first, second] = rows.concepts;
  const withLink = { ...rows, links: [...rows.links, link(first, rows.concepts[20].slug)] };
  assert.notEqual(conceptMapStructureSignature(buildConceptMapGraph(withLink, 'fr')), signature);
  const one = conceptMapStructureSignature(buildConceptMapGraph({ ...rows, links: [link(first, second.slug)] }, 'fr'));
  const other = conceptMapStructureSignature(buildConceptMapGraph({ ...rows, links: [link(second, first.slug)] }, 'fr'));
  assert.equal(one, other);
  const english = { ...rows, concepts: rows.concepts.map((item) => ({ ...item, language: 'en' })) };
  assert.notEqual(conceptMapStructureSignature(buildConceptMapGraph(english, 'en')), signature);
});

// lib/concept-map-data.ts uses the "@/" alias: run it in a sandbox with a fake database.
const dataSource = ts.transpileModule(readFileSync(new URL('../lib/concept-map-data.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

const crypto = await import('node:crypto');

function fakeDatabase(state) {
  const aggregate = (list) => async () => {
    state.aggregates += 1;
    if (state.failing) throw new Error('database unavailable');
    return { _count: { _all: list().length }, _max: { id: list().length, updatedAt: new Date(state.revision) } };
  };
  return {
    concept: {
      aggregate: aggregate(() => state.rows.concepts),
      findMany: async () => { state.queries += 1; return state.rows.concepts; }
    },
    conceptAlias: { aggregate: aggregate(() => state.rows.concepts.flatMap((item) => item.aliases)) },
    conceptRedirect: { aggregate: aggregate(() => state.rows.redirects), findMany: async () => state.rows.redirects },
    internalLink: {
      aggregate: async (args) => {
        assert.equal(JSON.stringify(args.where), '{"sourceType":"CONCEPT"}');
        return aggregate(() => state.rows.links)();
      },
      findMany: async (args) => { assert.equal(JSON.stringify(args.where), '{"sourceType":"CONCEPT"}'); return state.rows.links; }
    }
  };
}

async function loadDataModule(state) {
  const context = {
    exports: {}, setImmediate, performance, Date: { now: () => state.clock },
    console: { warn: (message) => state.warnings.push(message) },
    require: (name) => ({
      'node:crypto': crypto,
      '@/lib/db': { prisma: fakeDatabase(state) },
      '@/lib/markdown': { renderInlineMarkdown: async (markdown) => { state.rendered += 1; return `<em>${markdown}</em>`; } },
      '@/lib/languages': languages,
      '@/lib/concept-map': conceptMap,
      '@/lib/concept-map-layout': {
        ...layoutModule,
        computeConceptMapLayout: async (graph, ...args) => { state.layouts.push(graph.language); return layoutModule.computeConceptMapLayout(graph, ...args); }
      },
      '@/lib/concept-map-text': text
    })[name]
  };
  vm.runInNewContext(dataSource, context);
  return context.exports;
}

function bilingualRows() {
  const rows = syntheticRows(60, 5);
  rows.concepts[0].title = 'Espace $L^p$';
  // A few English pages, some of them translations of French ones.
  const english = rows.concepts.slice(0, 8).map((item, index) => concept(`${item.slug}-en`, {
    language: 'en', title: `English ${index}`, domainCode: item.domainCode,
    translationGroupId: index < 5 ? item.translationGroupId : `g-en-${index}`
  }));
  return { ...rows, concepts: [...rows.concepts, ...english], links: [...rows.links, link(english[1], english[2].slug), link(english[3], rows.concepts[4].slug)] };
}

test('the server computes one layout per language and structure, and answers at once while it changes', async () => {
  const rows = bilingualRows();
  const state = { rows, layouts: [], queries: 0, aggregates: 0, rendered: 0, warnings: [], revision: 1, clock: 1_000_000 };
  const data = await loadDataModule(state);
  await data.warmConceptMaps();
  assert.deepEqual(state.layouts, ['en', 'fr'], 'warm-up lays out every active language');
  assert.equal(state.queries, 1);

  const first = await data.getConceptMapResponse('fr', 1);
  const again = await data.getConceptMapResponse('fr', 1);
  const rest = await data.getConceptMapResponse('fr', 2);
  const english = await data.getConceptMapResponse('en', 1);
  const fallback = await data.getConceptMapResponse('es', 1);
  assert.deepEqual(state.layouts, ['en', 'fr'], 'nothing is recomputed after the warm-up');
  assert.equal(state.queries, 1, 'rows are reused while the stamp is fresh');
  assert.equal(first.etag, again.etag);
  assert.notEqual(first.etag, rest.etag);
  assert.notEqual(first.etag, english.etag);
  assert.equal(fallback.etag, english.etag, 'an inactive language falls back to the default one');
  assert.equal(first.provisional, false);

  const parsed = JSON.parse(first.body);
  assert.equal(parsed.language, 'fr');
  assert.equal(parsed.nodes.slug.length, 60);
  assert.ok(parsed.nodes.slug.every((slug) => !slug.endsWith('-en')), 'no English page on the French map');
  assert.equal(JSON.parse(rest.body).nodes.slug.length, 0);
  const englishParsed = JSON.parse(english.body);
  assert.deepEqual(englishParsed.nodes.slug.slice().sort(), rows.concepts.filter((item) => item.language === 'en').map((item) => item.slug).sort());
  assert.equal(englishParsed.links.length, 4, 'only the two citations written in English pages');
  const lpIndex = Number(Object.entries(parsed.nodes.title).find(([, title]) => title === 'Espace $L^p$')[0]);
  assert.equal(parsed.nodes.label[lpIndex], 'Espace Lᵖ');
  assert.equal(parsed.titleHtml[lpIndex], '<em>Espace $L^p$</em>');
  assert.equal(Object.keys(parsed.titleHtml).length, 1, 'only titles with markup are rendered');

  // Time passes without any edit: only the cheap stamp is read again.
  state.clock += 60_000;
  const unchanged = await data.getConceptMapResponse('fr', 1);
  assert.equal(unchanged.etag, first.etag);
  assert.equal(state.queries, 1);

  // A new citation changes the structure: the next answer is immediate and provisional.
  state.rows = { ...rows, links: [...rows.links, link(rows.concepts[1], rows.concepts[30].slug)] };
  state.revision += 1;
  state.clock += 60_000;
  const provisional = await data.getConceptMapResponse('fr', 1);
  assert.equal(provisional.provisional, true);
  assert.equal(state.queries, 2);
  assert.equal(JSON.parse(provisional.body).links.length, buildConceptMapGraph(state.rows, 'fr').citations.length * 2);
  assert.ok(JSON.parse(provisional.body).links.length > parsed.links.length);
  for (let attempt = 0; attempt < 100 && (await data.getConceptMapResponse('fr', 1)).provisional; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const settled = await data.getConceptMapResponse('fr', 1);
  assert.equal(settled.provisional, false);
  assert.deepEqual(state.layouts, ['en', 'fr', 'fr'], 'the English map did not change');
  assert.equal((await data.getConceptMapResponse('en', 1)).etag, english.etag);
});

test('a warm-up without database only logs a warning', async () => {
  const state = { rows: bilingualRows(), layouts: [], queries: 0, aggregates: 0, rendered: 0, warnings: [], revision: 1, clock: 5, failing: true };
  const data = await loadDataModule(state);
  await data.warmConceptMaps();
  assert.equal(state.warnings.length, 1);
  assert.match(state.warnings[0], /warm-up skipped \(en\): (Error: )?database unavailable/);
  // The failure is not cached: the next request reads the database again.
  state.failing = false;
  const response = await data.getConceptMapResponse('fr', 1);
  assert.equal(JSON.parse(response.body).nodes.slug.length, 60);
});
