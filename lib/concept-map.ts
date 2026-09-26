import { createHash } from "node:crypto";
import { parentProblemDomainForCode, PROBLEM_DOMAIN_FAMILIES, PROBLEM_DOMAINS } from "./domains.ts";
import { isActiveContentLanguage, parseContentLanguage } from "./languages.ts";
import { conceptMapLabel, normalizeConceptMapSearch } from "./concept-map-text.ts";

// The concept map of one content language: one node per concept page written in that language,
// one edge when the page of a concept cites another concept that also has a page in that
// language. An edge records a citation, not a prerequisite.

export type ConceptMapConceptRow = {
  id: number;
  slug: string;
  title: string;
  language: string;
  translationGroupId: string;
  translatedFromConceptId: number | null;
  status: string;
  kind: string;
  domainCode: string;
  aliases: readonly { alias: string; aliasSlug: string }[];
};

export type ConceptMapRedirectRow = {
  sourceSlug: string;
  targetConceptId: number;
  isRename: boolean;
};

export type ConceptMapLinkRow = {
  sourceId: number;
  targetSlug: string;
};

export type ConceptMapRows = {
  concepts: readonly ConceptMapConceptRow[];
  redirects: readonly ConceptMapRedirectRow[];
  links: readonly ConceptMapLinkRow[];
};

export type ConceptMapNodeSource = {
  /** Translation group id: stable across renames, used to seed the layout. */
  id: string;
  domain: string;
  concept: ConceptMapConceptRow;
  /** Titles of the other translations, only used by the search. */
  otherTitles: string[];
};

export type ConceptMapGraph = {
  language: string;
  nodes: ConceptMapNodeSource[];
  /** Directed citations between node indexes: [source, target]. Unique, never self-loops. */
  citations: [number, number][];
};

export type ConceptMapLayout = {
  signature: string;
  /** Positions keyed by node id, in a stable coordinate space (about ±1000). */
  positions: Map<string, { x: number; y: number }>;
  provisional?: boolean;
  /** Wall-clock time, including the pauses left to other requests. */
  durationMs?: number;
  /** CPU time actually spent in the layout. */
  computeMs?: number;
};

export type ConceptMapDomain = {
  code: string;
  family: string;
  color: string;
  count: number;
};

export const CONCEPT_MAP_STATUSES = ["STUB", "USABLE", "REVIEWED", "EXCELLENT", "CONTROVERSIAL", "MISSING"] as const;
export const CONCEPT_MAP_KINDS = ["DEFINITION", "THEOREM", "INTUITIVE_NOTION", "NOTATION"] as const;

/** Column-oriented nodes: compact JSON even for tens of thousands of concepts. */
export type ConceptMapNodeColumns = {
  slug: string[];
  label: string[];
  x: number[];
  y: number[];
  /** Index in ConceptMapPayload.domains. */
  domain: number[];
  /** Index in CONCEPT_MAP_STATUSES. */
  status: number[];
  /** Index in CONCEPT_MAP_KINDS. */
  kind: number[];
  /** Number of distinct cited or citing concepts. */
  degree: number[];
  /** Zoom level from which the concept is drawn (0: visible on the whole map). */
  level: number[];
  /** Markdown titles that differ from their plain label, by node index. */
  title: Record<number, string>;
  /** Aliases and titles of other translations (normalized), by node index, for the search. */
  terms: Record<number, string>;
};

export type ConceptMapTierInfo = { end: number; level: number };

export type ConceptMapPayload = {
  version: string;
  language: string;
  provisional: boolean;
  /** 1: the concepts drawn on the whole map (and the next levels if they are small); then one tier per zoom level. */
  tier: number;
  /** Global index of the first node of this chunk. */
  offset: number;
  total: { nodes: number; links: number };
  /** Extent of the whole map (all tiers). */
  bounds: { x: [number, number]; y: [number, number] };
  /** Every tier of the map: global index after its last node, and the deepest level it holds. */
  tiers: ConceptMapTierInfo[];
  maxLevel: number;
  domains: ConceptMapDomain[];
  nodes: ConceptMapNodeColumns;
  /** Flattened directed citations between global node indexes: [source0, target0, …]. */
  links: number[];
};

/**
 * The builders below are generators that pause every few thousand items, so that the server can
 * run them in slices between other requests (runConceptMapStepsSliced) or at once (runConceptMapSteps).
 */
export type ConceptMapSteps<T> = Generator<void, T, void>;

export function runConceptMapSteps<T>(steps: ConceptMapSteps<T>): T {
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

export async function runConceptMapStepsSliced<T>(
  steps: ConceptMapSteps<T>,
  yieldControl: () => Promise<void> | void,
  sliceBudgetMs = 8
): Promise<T> {
  let sliceStartedAt = performance.now();
  let result = steps.next();
  while (!result.done) {
    if (performance.now() - sliceStartedAt > sliceBudgetMs) {
      await yieldControl();
      sliceStartedAt = performance.now();
    }
    result = steps.next();
  }
  return result.value;
}

/** True every `every` items (a power of two): where the builders may pause. */
const pauseAt = (index: number, every = 2048) => (index & (every - 1)) === every - 1;

const DOMAIN_ORDER = new Map(PROBLEM_DOMAINS.map((domain, index) => [domain.value, index]));
const FALLBACK_DOMAIN = "other";

const topDomains = new Map<string, string>();

export function conceptMapTopDomain(domainCode: string | null | undefined) {
  const key = domainCode ?? "";
  let domain = topDomains.get(key);
  if (domain === undefined) {
    domain = parentProblemDomainForCode(domainCode)?.value ?? FALLBACK_DOMAIN;
    topDomains.set(key, domain);
  }
  return domain;
}

// Titles rarely change: their labels and search forms are kept from one build of the map to the next.
const titleTexts = new Map<string, { label: string; search: string }>();

function conceptMapTitleText(title: string) {
  let text = titleTexts.get(title);
  if (!text) {
    const label = conceptMapLabel(title);
    text = { label, search: normalizeConceptMapSearch(label) };
    if (titleTexts.size >= 250_000) titleTexts.clear();
    titleTexts.set(title, text);
  }
  return text;
}

export function conceptMapDomainOrder(domain: string) {
  return DOMAIN_ORDER.get(domain) ?? PROBLEM_DOMAINS.length;
}

export function conceptMapDomainStyle(domain: string) {
  const option = PROBLEM_DOMAINS.find((item) => item.value === domain);
  const family = option?.family ?? "other";
  return { family, color: PROBLEM_DOMAIN_FAMILIES[family].color };
}

export function isVisibleConceptMapTranslation(concept: Pick<ConceptMapConceptRow, "status" | "language">) {
  return concept.status !== "MISSING" && isActiveContentLanguage(concept.language);
}

type ResolutionIndex = {
  conceptById: Map<number, ConceptMapConceptRow>;
  conceptBySlug: Map<string, ConceptMapConceptRow>;
  aliasTarget: Map<string, number>;
  renameTarget: Map<string, number>;
  mergeTarget: Map<string, number>;
};

function* resolutionIndexSteps(rows: ConceptMapRows): ConceptMapSteps<ResolutionIndex> {
  const conceptById = new Map<number, ConceptMapConceptRow>();
  const conceptBySlug = new Map<string, ConceptMapConceptRow>();
  const aliasTarget = new Map<string, number>();
  for (let index = 0; index < rows.concepts.length; index += 1) {
    const concept = rows.concepts[index];
    conceptById.set(concept.id, concept);
    conceptBySlug.set(concept.slug, concept);
    for (const alias of concept.aliases) aliasTarget.set(alias.aliasSlug, concept.id);
    if (pauseAt(index)) yield;
  }
  const renameTarget = new Map<string, number>();
  const mergeTarget = new Map<string, number>();
  for (const redirect of rows.redirects) {
    (redirect.isRename ? renameTarget : mergeTarget).set(redirect.sourceSlug, redirect.targetConceptId);
  }
  return { conceptById, conceptBySlug, aliasTarget, renameTarget, mergeTarget };
}

/**
 * Resolves a stored InternalLink target the way a reader following the link would:
 * rename redirect, then live slug, then alias, then merge redirect (see app/concepts/[slug]).
 */
export function resolveConceptMapTarget(slug: string, index: ResolutionIndex) {
  const renamed = index.renameTarget.get(slug);
  if (renamed !== undefined) {
    const target = index.conceptById.get(renamed);
    if (target) return target;
  }
  const direct = index.conceptBySlug.get(slug);
  if (direct) return direct;
  const aliased = index.aliasTarget.get(slug);
  if (aliased !== undefined) return index.conceptById.get(aliased) ?? null;
  const merged = index.mergeTarget.get(slug);
  if (merged !== undefined) return index.conceptById.get(merged) ?? null;
  return null;
}

/**
 * Only pages written in `language` are nodes, and only their own citations are edges: a link
 * resolved to another translation of a concept points to that concept's page in `language`.
 */
export function buildConceptMapGraph(rows: ConceptMapRows, requestedLanguage: string): ConceptMapGraph {
  return runConceptMapSteps(conceptMapGraphSteps(rows, requestedLanguage));
}

export function* conceptMapGraphSteps(rows: ConceptMapRows, requestedLanguage: string): ConceptMapSteps<ConceptMapGraph> {
  const language = parseContentLanguage(requestedLanguage);
  const index = yield* resolutionIndexSteps(rows);
  const otherTitles = new Map<string, string[]>();
  const pages = new Map<string, ConceptMapConceptRow>();
  for (let position = 0; position < rows.concepts.length; position += 1) {
    const concept = rows.concepts[position];
    if (pauseAt(position)) yield;
    if (!isVisibleConceptMapTranslation(concept)) continue;
    if (concept.language === language) pages.set(concept.translationGroupId, concept);
    else {
      const titles = otherTitles.get(concept.translationGroupId);
      if (titles) titles.push(concept.title);
      else otherTitles.set(concept.translationGroupId, [concept.title]);
    }
  }
  yield;

  const nodes: ConceptMapNodeSource[] = [...pages.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([id, concept]) => ({
      id,
      domain: conceptMapTopDomain(concept.domainCode),
      concept,
      otherTitles: otherTitles.get(id) ?? []
    }));
  const nodeIndex = new Map(nodes.map((node, position) => [node.id, position]));
  yield;

  const seen = new Set<number>();
  const citations: [number, number][] = [];
  const size = nodes.length;
  for (let position = 0; position < rows.links.length; position += 1) {
    if (pauseAt(position)) yield;
    const link = rows.links[position];
    const source = index.conceptById.get(link.sourceId);
    if (!source || source.language !== language || !isVisibleConceptMapTranslation(source)) continue;
    const sourceNode = nodeIndex.get(source.translationGroupId);
    const target = resolveConceptMapTarget(link.targetSlug, index);
    const targetNode = target ? nodeIndex.get(target.translationGroupId) : undefined;
    if (sourceNode === undefined || targetNode === undefined || sourceNode === targetNode) continue;
    const key = sourceNode * size + targetNode;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push([sourceNode, targetNode]);
  }
  yield;
  citations.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  return { language, nodes, citations };
}

/** Undirected unique edges, used by the layout. */
export function conceptMapUndirectedEdges(graph: ConceptMapGraph) {
  const seen = new Set<number>();
  const edges: [number, number][] = [];
  const size = graph.nodes.length;
  for (const [source, target] of graph.citations) {
    const low = Math.min(source, target);
    const high = Math.max(source, target);
    const key = low * size + high;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([low, high]);
  }
  return edges;
}

/**
 * How central a concept is: being cited counts twice as much as citing. Used to choose what is
 * drawn when zoomed out and which concepts get the most careful layout.
 */
export function conceptMapImportance(graph: ConceptMapGraph) {
  const incoming = graph.nodes.map(() => 0);
  const outgoing = graph.nodes.map(() => 0);
  for (const [source, target] of graph.citations) {
    outgoing[source] += 1;
    incoming[target] += 1;
  }
  return graph.nodes.map((_, index) => incoming[index] * 2 + outgoing[index]);
}

/** Identifies what the layout depends on: language, nodes, their domains and undirected edges. */
export function conceptMapStructureSignature(graph: ConceptMapGraph) {
  return runConceptMapSteps(conceptMapSignatureSteps(graph));
}

export function* conceptMapSignatureSteps(graph: ConceptMapGraph): ConceptMapSteps<string> {
  const hash = createHash("sha1");
  hash.update(`${graph.language}\u0003`);
  for (let index = 0; index < graph.nodes.length; index += 1) {
    const node = graph.nodes[index];
    hash.update(`${node.id}\u0001${node.domain}\u0002`);
    if (pauseAt(index)) yield;
  }
  hash.update("\u0003");
  yield;
  const edges = conceptMapUndirectedEdges(graph);
  for (let index = 0; index < edges.length; index += 1) {
    const [low, high] = edges[index];
    hash.update(`${graph.nodes[low].id}\u0001${graph.nodes[high].id}\u0002`);
    if (pauseAt(index)) yield;
  }
  return hash.digest("base64url").slice(0, 20);
}

export type ConceptMapLevelOptions = {
  /** Most concepts drawn on the whole map (level 0). */
  overviewBudget?: number;
  /** Concepts kept per grid cell at each level. */
  cellCapacity?: number;
};

/**
 * Level of detail, like place names on a map: the plane is divided into a grid that doubles in
 * resolution at each level, and each cell shows its most important concepts only. Level 0 holds
 * at most `overviewBudget` concepts, whatever the size of the map; every concept is shown at the
 * last level. Small maps keep every concept at level 0.
 */
export function conceptMapLevels(
  positions: readonly { x: number; y: number }[],
  importance: readonly number[],
  options: ConceptMapLevelOptions = {}
) {
  return runConceptMapSteps(conceptMapLevelSteps(positions, importance, options));
}

function* conceptMapLevelSteps(
  positions: readonly { x: number; y: number }[],
  importance: readonly number[],
  options: ConceptMapLevelOptions = {}
): ConceptMapSteps<{ levels: number[]; maxLevel: number }> {
  const overviewBudget = options.overviewBudget ?? 1500;
  const capacity = options.cellCapacity ?? 2;
  const count = positions.length;
  const levels = new Array<number>(count).fill(0);
  if (count <= overviewBudget) return { levels, maxLevel: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of positions) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const order = positions.map((_, index) => index).sort((left, right) => importance[right] - importance[left] || left - right);
  const cellOf = (index: number, grid: number) => {
    const column = Math.min(grid - 1, Math.floor(((positions[index].x - minX) / span) * grid));
    const row = Math.min(grid - 1, Math.floor(((positions[index].y - minY) / span) * grid));
    return row * grid + column;
  };
  function* shownAt(grid: number): ConceptMapSteps<Uint8Array> {
    const used = new Map<number, number>();
    const shown = new Uint8Array(count);
    for (let position = 0; position < count; position += 1) {
      const index = order[position];
      const cell = cellOf(index, grid);
      const taken = used.get(cell) ?? 0;
      if (taken < capacity) {
        used.set(cell, taken + 1);
        shown[index] = 1;
      }
      if (pauseAt(position, 8192)) yield;
    }
    return shown;
  }
  yield;

  // The finest base grid whose level 0 still fits the budget (the count grows with the grid).
  let baseGrid = 4;
  let tooFine = 257;
  while (tooFine - baseGrid > 1) {
    const middle = (baseGrid + tooFine) >> 1;
    const shown = yield* shownAt(middle);
    if (shown.reduce((sum, value) => sum + value, 0) <= overviewBudget) baseGrid = middle;
    else tooFine = middle;
  }
  const maxLevel = Math.max(1, Math.min(8, Math.ceil(Math.log2(Math.sqrt(count / overviewBudget))) + 2));
  levels.fill(maxLevel);
  for (let level = maxLevel - 1; level >= 0; level -= 1) {
    const shown = yield* shownAt(baseGrid * 2 ** level);
    for (let index = 0; index < count; index += 1) if (shown[index]) levels[index] = level;
  }
  return { levels, maxLevel };
}

/** Node order of the payload: by level, then by importance, so that tier 1 is a prefix. */
export function conceptMapPayloadOrder(levels: readonly number[], importance: readonly number[], graph: ConceptMapGraph) {
  return graph.nodes
    .map((_, index) => index)
    .sort((left, right) => levels[left] - levels[right] || importance[right] - importance[left] || (graph.nodes[left].id < graph.nodes[right].id ? -1 : 1));
}

function roundCoordinate(value: number) {
  return Math.round(value * 10) / 10;
}

export type ConceptMapPrepared = {
  graph: ConceptMapGraph;
  layout: ConceptMapLayout;
  levels: number[];
  maxLevel: number;
  /** Payload position → graph node index. */
  order: number[];
  tiers: ConceptMapTierInfo[];
  degree: number[];
  domains: ConceptMapDomain[];
  domainIndex: Map<string, number>;
  undirectedLinks: number;
  bounds: { x: [number, number]; y: [number, number] };
};

/** Everything the payloads of one layout share: levels, order, tiers and domains. */
export function prepareConceptMap(
  graph: ConceptMapGraph,
  layout: ConceptMapLayout,
  options: ConceptMapLevelOptions & { tierBudget?: number } = {}
): ConceptMapPrepared {
  return runConceptMapSteps(prepareConceptMapSteps(graph, layout, options));
}

export function* prepareConceptMapSteps(
  graph: ConceptMapGraph,
  layout: ConceptMapLayout,
  options: ConceptMapLevelOptions & { tierBudget?: number } = {}
): ConceptMapSteps<ConceptMapPrepared> {
  const tierBudget = options.tierBudget ?? 3000;
  const importance = conceptMapImportance(graph);
  const positions = graph.nodes.map((node) => layout.positions.get(node.id) ?? { x: 0, y: 0 });
  const { levels, maxLevel } = yield* conceptMapLevelSteps(positions, importance, options);
  const order = conceptMapPayloadOrder(levels, importance, graph);
  yield;

  // Tier 1: whole levels, as many as fit in the budget (level 0 always does); then one tier per
  // level, so that each zoom step only brings its own concepts.
  const upTo = new Array<number>(maxLevel + 1).fill(0);
  for (const level of levels) upTo[level] += 1;
  for (let level = 1; level <= maxLevel; level += 1) upTo[level] += upTo[level - 1];
  let firstLevel = 0;
  while (firstLevel < maxLevel && upTo[firstLevel + 1] <= tierBudget) firstLevel += 1;
  const tiers: ConceptMapTierInfo[] = [{ end: upTo[firstLevel], level: firstLevel }];
  for (let level = firstLevel + 1; level <= maxLevel; level += 1) {
    if (upTo[level] > upTo[level - 1]) tiers.push({ end: upTo[level], level });
  }

  const neighbors = graph.nodes.map(() => new Set<number>());
  for (const [source, target] of graph.citations) {
    neighbors[source].add(target);
    neighbors[target].add(source);
  }
  const degree = neighbors.map((set) => set.size);
  yield;
  const domainCounts = new Map<string, number>();
  for (const node of graph.nodes) domainCounts.set(node.domain, (domainCounts.get(node.domain) ?? 0) + 1);
  const domains: ConceptMapDomain[] = [...domainCounts.entries()]
    .sort(([left], [right]) => conceptMapDomainOrder(left) - conceptMapDomainOrder(right) || left.localeCompare(right))
    .map(([code, count]) => ({ code, count, ...conceptMapDomainStyle(code) }));
  const undirectedLinks = degree.reduce((sum, value) => sum + value, 0) / 2;
  const bounds: { x: [number, number]; y: [number, number] } = { x: [Infinity, -Infinity], y: [Infinity, -Infinity] };
  for (const point of positions) {
    const x = roundCoordinate(point.x);
    const y = roundCoordinate(point.y);
    bounds.x = [Math.min(bounds.x[0], x), Math.max(bounds.x[1], x)];
    bounds.y = [Math.min(bounds.y[0], y), Math.max(bounds.y[1], y)];
  }
  if (!positions.length) Object.assign(bounds, { x: [-1, 1], y: [-1, 1] });
  return {
    bounds,
    graph,
    layout,
    levels,
    maxLevel,
    order,
    tiers,
    degree,
    domains,
    domainIndex: new Map(domains.map((domain, position) => [domain.code, position])),
    undirectedLinks
  };
}

/**
 * A tier holds a contiguous run of nodes in payload order, and the links whose later end is in
 * it: once tiers 1…k are loaded, every link between their nodes is known. A tier beyond the last
 * one is empty.
 */
export function buildConceptMapPayload(prepared: ConceptMapPrepared, tier: number): ConceptMapPayload {
  return runConceptMapSteps(conceptMapPayloadSteps(prepared, tier));
}

export function* conceptMapPayloadSteps(prepared: ConceptMapPrepared, tier: number): ConceptMapSteps<ConceptMapPayload> {
  const { graph, layout, order, levels, degree, domainIndex, tiers } = prepared;
  const start = tier <= 1 ? 0 : tiers[tier - 2]?.end ?? order.length;
  const end = tiers[Math.max(tier, 1) - 1]?.end ?? order.length;
  const positionInPayload = new Array<number>(order.length);
  order.forEach((graphIndex, payloadIndex) => {
    positionInPayload[graphIndex] = payloadIndex;
  });

  const nodes: ConceptMapNodeColumns = {
    slug: [], label: [], x: [], y: [], domain: [], status: [], kind: [], degree: [], level: [], title: {}, terms: {}
  };
  for (let payloadIndex = start; payloadIndex < end; payloadIndex += 1) {
    if (pauseAt(payloadIndex - start, 1024)) yield;
    const graphIndex = order[payloadIndex];
    const source = graph.nodes[graphIndex];
    const concept = source.concept;
    const text = conceptMapTitleText(concept.title);
    const label = text.label || concept.slug;
    const position = layout.positions.get(source.id) ?? { x: 0, y: 0 };
    nodes.slug.push(concept.slug);
    nodes.label.push(label);
    nodes.x.push(roundCoordinate(position.x));
    nodes.y.push(roundCoordinate(position.y));
    nodes.domain.push(domainIndex.get(source.domain) ?? 0);
    nodes.status.push(Math.max(0, CONCEPT_MAP_STATUSES.indexOf(concept.status as (typeof CONCEPT_MAP_STATUSES)[number])));
    nodes.kind.push(Math.max(0, CONCEPT_MAP_KINDS.indexOf(concept.kind as (typeof CONCEPT_MAP_KINDS)[number])));
    nodes.degree.push(degree[graphIndex]);
    nodes.level.push(levels[graphIndex]);
    if (label !== concept.title) nodes.title[payloadIndex] = concept.title;
    const normalizedLabel = text.label ? text.search : normalizeConceptMapSearch(label);
    const terms = [...new Set(
      [...concept.aliases.map((alias) => alias.alias), ...source.otherTitles]
        .map((value) => conceptMapTitleText(value).search)
        .filter((value) => value && value !== normalizedLabel)
    )];
    if (terms.length) nodes.terms[payloadIndex] = terms.join("\n");
  }

  yield;
  const links: number[] = [];
  for (let position = 0; position < graph.citations.length; position += 1) {
    if (pauseAt(position, 8192)) yield;
    const [source, target] = graph.citations[position];
    const from = positionInPayload[source];
    const to = positionInPayload[target];
    const later = Math.max(from, to);
    if (later >= start && later < end) links.push(from, to);
  }

  return {
    // Tiers of a provisional map must not be mixed with those of the final one.
    version: layout.provisional ? `${layout.signature}~p` : layout.signature,
    language: graph.language,
    provisional: Boolean(layout.provisional),
    tier: Math.max(tier, 1),
    offset: start,
    total: { nodes: order.length, links: prepared.undirectedLinks },
    bounds: prepared.bounds,
    tiers,
    maxLevel: prepared.maxLevel,
    domains: prepared.domains,
    nodes,
    links
  };
}
