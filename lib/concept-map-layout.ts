import {
  conceptMapDomainOrder,
  conceptMapImportance,
  conceptMapSignatureSteps,
  conceptMapStructureSignature,
  conceptMapUndirectedEdges,
  type ConceptMapGraph,
  type ConceptMapLayout
} from "./concept-map.ts";
import iterate, { type ForceAtlas2IterationSettings } from "./forceatlas2-iterate.ts";

// Deterministic, precomputed layout, computed on the server and never simulated in the browser.
//
// 1. Skeleton: the most important concepts (all of them on maps up to SKELETON_SIZE) run through
//    ForceAtlas2. Each domain has a fixed invisible anchor on a ring; concepts are tied to their
//    domain anchor by a weak spring and to each other by their citations. Initial positions come
//    from a hash of the translation group, so a given graph always produces the same map.
// 2. Large maps: the skeleton is spread to the density of the whole map, then every other concept
//    is placed, round after round, next to the concepts it is linked to (a sunflower pattern around
//    its most important placed neighbor); unconnected concepts join their domain.
// 3. The dots that still overlap are pushed apart (a spatial grid keeps this linear too).
//
// The cost of step 1 is bounded, so the whole layout stays linear in the size of the map.

const PPN = 10; // ForceAtlas2 values per node.
const PPE = 3; // ForceAtlas2 values per edge.
const NODE_MASS = 6;
const NODE_SIZE = 8;
const NODE_FIXED = 9;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export const CONCEPT_MAP_EXTENT = 1000;
export const CONCEPT_MAP_SKELETON_SIZE = 2500;

export type ConceptMapLayoutOptions = {
  /** Called between slices of work; return a promise to yield to the event loop. */
  yieldControl?: () => Promise<void> | void;
  /** Longest synchronous stretch before yielding, in milliseconds (default 8). */
  sliceBudgetMs?: number;
  /** Concepts laid out by ForceAtlas2 (default CONCEPT_MAP_SKELETON_SIZE). */
  skeletonSize?: number;
  /** conceptMapStructureSignature(graph), when already known. */
  signature?: string;
};

function hashString(value: string) {
  // FNV-1a, 32 bits.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededPair(value: string): [number, number] {
  // mulberry32 seeded by the node id: stable pseudo-random numbers in [0, 1).
  let state = hashString(value) || 1;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return [next(), next()];
}

export function conceptMapIterations(order: number) {
  if (order <= 600) return 300;
  return 200;
}

function domainAnchors(domainCounts: Map<string, number>, radius: number) {
  const domains = [...domainCounts.keys()].sort(
    (left, right) => conceptMapDomainOrder(left) - conceptMapDomainOrder(right) || left.localeCompare(right)
  );
  const anchors = new Map<string, { x: number; y: number; spread: number }>();
  if (domains.length === 1) {
    anchors.set(domains[0], { x: 0, y: 0, spread: radius * 0.5 });
    return anchors;
  }
  const weights = domains.map((domain) => Math.sqrt(domainCounts.get(domain) ?? 1) + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let angle = -Math.PI / 2;
  domains.forEach((domain, position) => {
    const span = (weights[position] / total) * Math.PI * 2;
    const middle = angle + span / 2;
    anchors.set(domain, {
      x: Math.cos(middle) * radius,
      y: Math.sin(middle) * radius,
      spread: Math.max(radius * 0.08, Math.min(radius * 0.45, radius * Math.sin(Math.min(span, Math.PI) / 2)))
    });
    angle += span;
  });
  return anchors;
}

function settingsFor(order: number): ForceAtlas2IterationSettings {
  return {
    linLogMode: false,
    adjustSizes: false,
    outboundAttractionDistribution: false,
    edgeWeightInfluence: 1,
    scalingRatio: 12,
    strongGravityMode: false,
    gravity: 0.35,
    slowDown: 1 + Math.log(Math.max(order, 2)),
    barnesHutOptimize: order > 250,
    barnesHutTheta: 0.6
  };
}

function normalizePositions(xs: Float64Array, ys: Float64Array) {
  const count = xs.length;
  if (count === 0) return;
  let cx = 0;
  let cy = 0;
  for (let index = 0; index < count; index += 1) {
    cx += xs[index];
    cy += ys[index];
  }
  cx /= count;
  cy /= count;
  const radii: number[] = [];
  for (let index = 0; index < count; index += 1) {
    xs[index] -= cx;
    ys[index] -= cy;
    radii.push(Math.hypot(xs[index], ys[index]));
  }
  radii.sort((left, right) => left - right);
  const reference = radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.98))] || 1;
  const scale = CONCEPT_MAP_EXTENT / reference;
  for (let index = 0; index < count; index += 1) {
    xs[index] *= scale;
    ys[index] *= scale;
  }
}

const CELL_OFFSET = 2 ** 20;
const CELL_SPAN = 2 ** 21;

/**
 * Pushes apart the discs that overlap, like graphology-layout-noverlap, but on a spatial grid:
 * each iteration is linear in the number of concepts and can be sliced. Displacements are summed
 * before being applied, so the result depends neither on the slicing nor on the order of cells.
 */
async function separateOverlaps(
  xs: Float64Array,
  ys: Float64Array,
  radii: Float64Array,
  margin: number,
  iterations: number,
  maybeYield: () => Promise<void>
) {
  const count = xs.length;
  if (count < 2) return;
  const sortedRadii = Float64Array.from(radii).sort();
  const cell = 2 * sortedRadii[Math.floor(count / 2)] + margin;
  const dx = new Float64Array(count);
  const dy = new Float64Array(count);
  const firstColumn = new Int32Array(count);
  const firstRow = new Int32Array(count);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const cells = new Map<number, number[]>();
    for (let index = 0; index < count; index += 1) {
      const reach = radii[index] + margin / 2;
      const column0 = Math.floor((xs[index] - reach) / cell);
      const column1 = Math.floor((xs[index] + reach) / cell);
      const row0 = Math.floor((ys[index] - reach) / cell);
      const row1 = Math.floor((ys[index] + reach) / cell);
      firstColumn[index] = column0;
      firstRow[index] = row0;
      for (let column = column0; column <= column1; column += 1) {
        for (let row = row0; row <= row1; row += 1) {
          const key = (column + CELL_OFFSET) * CELL_SPAN + (row + CELL_OFFSET);
          const members = cells.get(key);
          if (members) members.push(index);
          else cells.set(key, [index]);
        }
      }
      if ((index & 4095) === 4095) await maybeYield();
    }
    dx.fill(0);
    dy.fill(0);
    let overlaps = 0;
    let visited = 0;
    for (const [key, members] of cells) {
      if (members.length > 1) {
        const column = Math.floor(key / CELL_SPAN) - CELL_OFFSET;
        const row = (key % CELL_SPAN) - CELL_OFFSET;
        for (let a = 0; a < members.length; a += 1) {
          const first = members[a];
          for (let b = a + 1; b < members.length; b += 1) {
            const second = members[b];
            // A pair sharing several cells is only handled in the first of them.
            if (Math.max(firstColumn[first], firstColumn[second]) !== column || Math.max(firstRow[first], firstRow[second]) !== row) continue;
            let offsetX = xs[second] - xs[first];
            let offsetY = ys[second] - ys[first];
            const minimum = radii[first] + radii[second] + margin;
            let distance = Math.hypot(offsetX, offsetY);
            // Near-tangent discs are left alone: the last fractions of overlap never quite vanish.
            if (distance >= minimum * 0.98) continue;
            const overlap = minimum - distance;
            if (distance < 1e-9) {
              const angle = ((first * 7919 + second * 104729) % 360) * (Math.PI / 180);
              offsetX = Math.cos(angle);
              offsetY = Math.sin(angle);
              distance = 1;
            }
            // The overlap is shared between both discs, the larger one moving less.
            const push = overlap / (radii[first] + radii[second]);
            const unitX = offsetX / distance;
            const unitY = offsetY / distance;
            dx[first] -= unitX * push * radii[second];
            dy[first] -= unitY * push * radii[second];
            dx[second] += unitX * push * radii[first];
            dy[second] += unitY * push * radii[first];
            overlaps += 1;
          }
        }
      }
      visited += 1;
      if ((visited & 1023) === 1023) await maybeYield();
    }
    if (overlaps === 0) break;
    for (let index = 0; index < count; index += 1) {
      // Damped, so that a disc pushed from several sides does not overshoot.
      const length = Math.hypot(dx[index], dy[index]);
      const scale = length > cell ? (0.6 * cell) / length : 0.6;
      xs[index] += dx[index] * scale;
      ys[index] += dy[index] * scale;
    }
    await maybeYield();
  }
}

/** Computes the whole layout from scratch. Deterministic for a given graph. */
export async function computeConceptMapLayout(
  graph: ConceptMapGraph,
  options: ConceptMapLayoutOptions = {}
): Promise<ConceptMapLayout> {
  const startedAt = performance.now();
  // Yielding never changes the result, only when other requests may run.
  const sliceBudgetMs = options.sliceBudgetMs ?? 8;
  let computeMs = 0;
  let sliceStartedAt = startedAt;
  const maybeYield = async (force = false) => {
    if (!options.yieldControl || (!force && performance.now() - sliceStartedAt <= sliceBudgetMs)) return;
    computeMs += performance.now() - sliceStartedAt;
    await options.yieldControl();
    sliceStartedAt = performance.now();
  };

  let signature = options.signature;
  if (signature === undefined) {
    const steps = conceptMapSignatureSteps(graph);
    let step = steps.next();
    while (!step.done) {
      await maybeYield();
      step = steps.next();
    }
    signature = step.value;
  }
  const order = graph.nodes.length;
  const positions = new Map<string, { x: number; y: number }>();
  if (order === 0) return { signature, positions, durationMs: 0, computeMs: 0 };

  await maybeYield();
  const edges = conceptMapUndirectedEdges(graph);
  const neighbors = graph.nodes.map(() => [] as number[]);
  for (const [low, high] of edges) {
    neighbors[low].push(high);
    neighbors[high].push(low);
  }
  const importance = conceptMapImportance(graph);
  const domainCounts = new Map<string, number>();
  for (const node of graph.nodes) domainCounts.set(node.domain, (domainCounts.get(node.domain) ?? 0) + 1);

  await maybeYield();

  // 1. Skeleton.
  const skeletonLimit = options.skeletonSize ?? CONCEPT_MAP_SKELETON_SIZE;
  const skeleton = graph.nodes
    .map((_, index) => index)
    .sort((left, right) => importance[right] - importance[left] || (graph.nodes[left].id < graph.nodes[right].id ? -1 : 1))
    .slice(0, Math.min(order, skeletonLimit))
    .sort((left, right) => left - right);
  const skeletonIndex = new Map(skeleton.map((node, position) => [node, position]));
  const size = skeleton.length;

  const settings = settingsFor(size);
  // Typical distance between linked concepts at equilibrium is about sqrt(scalingRatio * mass²).
  const unit = Math.sqrt(settings.scalingRatio) * 2;
  const anchors = domainAnchors(domainCounts, unit * Math.sqrt(size) * 1.2);
  const anchorKeys = [...anchors.keys()];
  const anchorIndex = new Map(anchorKeys.map((domain, position) => [domain, size + position]));

  const nodeMatrix = new Float32Array((size + anchorKeys.length) * PPN);
  skeleton.forEach((node, position) => {
    const anchor = anchors.get(graph.nodes[node].domain)!;
    const [u, v] = seededPair(graph.nodes[node].id);
    const distance = anchor.spread * Math.sqrt(u);
    const base = position * PPN;
    nodeMatrix[base] = anchor.x + Math.cos(v * Math.PI * 2) * distance;
    nodeMatrix[base + 1] = anchor.y + Math.sin(v * Math.PI * 2) * distance;
    nodeMatrix[base + NODE_MASS] = 2;
    nodeMatrix[base + 7] = 1;
    nodeMatrix[base + NODE_SIZE] = 1;
  });
  anchorKeys.forEach((domain, position) => {
    const anchor = anchors.get(domain)!;
    const base = (size + position) * PPN;
    nodeMatrix[base] = anchor.x;
    nodeMatrix[base + 1] = anchor.y;
    nodeMatrix[base + NODE_MASS] = 1;
    nodeMatrix[base + 7] = 1;
    nodeMatrix[base + NODE_SIZE] = 1;
    nodeMatrix[base + NODE_FIXED] = 1;
  });
  const skeletonEdges = edges.filter(([low, high]) => skeletonIndex.has(low) && skeletonIndex.has(high));
  const edgeMatrix = new Float32Array((skeletonEdges.length + size) * PPE);
  let edgeOffset = 0;
  const addEdge = (source: number, target: number, weight: number, targetMass: boolean) => {
    edgeMatrix[edgeOffset] = source * PPN;
    edgeMatrix[edgeOffset + 1] = target * PPN;
    edgeMatrix[edgeOffset + 2] = weight;
    nodeMatrix[source * PPN + NODE_MASS] += weight;
    if (targetMass) nodeMatrix[target * PPN + NODE_MASS] += weight;
    edgeOffset += PPE;
  };
  for (const [low, high] of skeletonEdges) addEdge(skeletonIndex.get(low)!, skeletonIndex.get(high)!, 1, true);
  // Anchors keep a unit mass: they pin domains without repelling their concepts.
  skeleton.forEach((node, position) => addEdge(position, anchorIndex.get(graph.nodes[node].domain)!, 1.5, false));

  await maybeYield();
  const iterations = conceptMapIterations(size);
  for (let done = 0; done < iterations; done += 1) {
    iterate(settings, nodeMatrix, edgeMatrix);
    if (done + 1 < iterations) await maybeYield();
  }

  // 2. Everything else, next to what it is linked to.
  const xs = new Float64Array(order);
  const ys = new Float64Array(order);
  const placed = new Uint8Array(order);
  const spread = order > size ? Math.sqrt(order / size) : 1;
  skeleton.forEach((node, position) => {
    xs[node] = nodeMatrix[position * PPN] * spread;
    ys[node] = nodeMatrix[position * PPN + 1] * spread;
    placed[node] = 1;
  });
  if (order > size) {
    const spacing = unit * 0.9;
    const children = new Map<number, number>();
    const sunflower = (centerX: number, centerY: number, key: number, seed: string, target: number) => {
      const rank = children.get(key) ?? 0;
      children.set(key, rank + 1);
      const angle = rank * GOLDEN_ANGLE + seededPair(seed)[0] * Math.PI * 2;
      const radius = spacing * (1 + 0.9 * Math.sqrt(rank));
      xs[target] = centerX + Math.cos(angle) * radius;
      ys[target] = centerY + Math.sin(angle) * radius;
    };
    let frontier = graph.nodes.map((_, index) => index).filter((index) => !placed[index] && neighbors[index].some((other) => placed[other]));
    while (frontier.length) {
      // A round only reads positions of earlier rounds: the result does not depend on the order.
      for (const node of frontier) {
        const around = neighbors[node].filter((other) => placed[other] === 1);
        const parent = around.reduce((best, other) => (importance[other] > importance[best] || (importance[other] === importance[best] && other < best) ? other : best));
        const centerX = around.reduce((sum, other) => sum + xs[other], 0) / around.length;
        const centerY = around.reduce((sum, other) => sum + ys[other], 0) / around.length;
        sunflower(centerX, centerY, parent, graph.nodes[parent].id, node);
      }
      for (const node of frontier) placed[node] = 1;
      const next = new Set<number>();
      for (const node of frontier) for (const other of neighbors[node]) if (!placed[other]) next.add(other);
      frontier = [...next].sort((left, right) => left - right);
      await maybeYield();
    }
    // Concepts linked to nothing already placed gather around the center of their domain.
    const domainCenters = new Map<string, { x: number; y: number; count: number }>();
    graph.nodes.forEach((node, index) => {
      if (!placed[index]) return;
      const center = domainCenters.get(node.domain) ?? { x: 0, y: 0, count: 0 };
      center.x += xs[index];
      center.y += ys[index];
      center.count += 1;
      domainCenters.set(node.domain, center);
    });
    const domainKeys = new Map(anchorKeys.map((domain, position) => [domain, -1 - position]));
    graph.nodes.forEach((node, index) => {
      if (placed[index]) return;
      const center = domainCenters.get(node.domain);
      const anchor = anchors.get(node.domain)!;
      const centerX = center?.count ? center.x / center.count : anchor.x * spread;
      const centerY = center?.count ? center.y / center.count : anchor.y * spread;
      sunflower(centerX, centerY, domainKeys.get(node.domain)!, node.domain, index);
    });
  }
  await maybeYield();

  // 3. Remove overlaps with sizes close to the rendered ones (hubs are larger).
  const radii = new Float64Array(order);
  graph.nodes.forEach((_, index) => {
    radii[index] = unit * (0.22 + Math.sqrt(neighbors[index].length) * 0.08);
  });
  await separateOverlaps(xs, ys, radii, unit * 0.12, order > 20000 ? 16 : order > 5000 ? 24 : 40, maybeYield);
  normalizePositions(xs, ys);
  graph.nodes.forEach((node, index) => positions.set(node.id, { x: xs[index], y: ys[index] }));
  computeMs += performance.now() - sliceStartedAt;

  return { signature, positions, durationMs: Math.round(performance.now() - startedAt), computeMs: Math.round(computeMs) };
}

/**
 * Cheap placeholder used while a new layout is computed: known concepts keep their previous
 * position and new ones are placed next to their cited neighbors (or their domain).
 */
export function approximateConceptMapLayout(
  graph: ConceptMapGraph,
  previous: ConceptMapLayout,
  signature = conceptMapStructureSignature(graph)
): ConceptMapLayout {
  const positions = new Map<string, { x: number; y: number }>();
  const domainSums = new Map<string, { x: number; y: number; count: number }>();
  for (const node of graph.nodes) {
    const known = previous.positions.get(node.id);
    if (!known) continue;
    positions.set(node.id, known);
    const sum = domainSums.get(node.domain) ?? { x: 0, y: 0, count: 0 };
    sum.x += known.x;
    sum.y += known.y;
    sum.count += 1;
    domainSums.set(node.domain, sum);
  }
  const neighbors = graph.nodes.map(() => [] as number[]);
  for (const [low, high] of conceptMapUndirectedEdges(graph)) {
    neighbors[low].push(high);
    neighbors[high].push(low);
  }
  graph.nodes.forEach((node, index) => {
    if (positions.has(node.id)) return;
    const placed = neighbors[index]
      .map((neighbor) => previous.positions.get(graph.nodes[neighbor].id))
      .filter((point): point is { x: number; y: number } => Boolean(point));
    const domainSum = domainSums.get(node.domain);
    const center = placed.length
      ? {
          x: placed.reduce((sum, point) => sum + point.x, 0) / placed.length,
          y: placed.reduce((sum, point) => sum + point.y, 0) / placed.length
        }
      : domainSum
        ? { x: domainSum.x / domainSum.count, y: domainSum.y / domainSum.count }
        : { x: 0, y: 0 };
    const [u, v] = seededPair(node.id);
    const distance = CONCEPT_MAP_EXTENT * 0.03 * (0.5 + u);
    positions.set(node.id, {
      x: center.x + Math.cos(v * Math.PI * 2) * distance,
      y: center.y + Math.sin(v * Math.PI * 2) * distance
    });
  });
  return { signature, positions, provisional: true };
}
