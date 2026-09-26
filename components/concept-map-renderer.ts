import Graph from "graphology";
import Sigma from "sigma";
import type { NodeDisplayData, PartialButFor } from "sigma/types";
import type { Settings } from "sigma/settings";

// Imperative Sigma wrapper for the concept map, loaded with a dynamic import so that WebGL code
// only reaches readers who open the map. Positions come precomputed from the server: nothing is
// simulated here. The renderer exists before the data: the map is on screen at once and the
// concepts are added when they arrive (first the most important ones, then the others).
//
// Level of detail: each concept has a level; at camera ratio r the levels up to
// log2(1 / r) are drawn, so the number of dots on screen stays about constant while zooming.
// The selection, its neighbors and search results are always drawn.

export type ConceptMapRendererData = {
  bounds: { x: [number, number]; y: [number, number] };
  domains: { color: string }[];
  x: number[];
  y: number[];
  label: string[];
  domain: number[];
  status: number[];
  degree: number[];
  level: number[];
  /** Deepest level of detail of the whole map. */
  maxLevel: number;
};

export type ConceptMapRendererState = {
  selected: number | null;
  hovered: number | null;
  /** Node indexes matching the search, or null when there is no active search. */
  matches: ReadonlySet<number> | null;
  hiddenDomains: ReadonlySet<number>;
};

export type ConceptMapRendererCallbacks = {
  onSelect: (node: number | null) => void;
  onOpen: (node: number) => void;
  onHover: (node: number | null) => void;
  /** Deepest level of detail needed one zoom step ahead of the camera (only ever increases). */
  onLevel?: (level: number) => void;
};

export type ConceptMapRenderer = {
  /** Adds the nodes [from, data.x.length) and the given links (global node indexes). */
  addNodes: (data: ConceptMapRendererData, from: number, links: readonly number[]) => void;
  update: (state: Partial<ConceptMapRendererState>) => void;
  focus: (node: number, options?: { zoom?: boolean; bottomInset?: number }) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  pan: (dx: number, dy: number) => void;
  resize: () => void;
  getCamera: () => { x: number; y: number; ratio: number };
  setCamera: (state: { x: number; y: number; ratio: number }) => void;
  destroy: () => void;
};

type LabelRequest = { index: number; x: number; y: number; size: number; label: string; priority: number; strong: boolean };
type Box = [number, number, number, number];

const INK = "#22201d";
// Opaque colors: translucent WebGL lines are composited unevenly (they turn white on some GPUs).
const EDGE = "#cbc4b3";
const FADED_EDGE = "#ece6d8";
const EDGE_HIGHLIGHT = "#3d7955";
const STUB_STATUS = 0;
// Above this many concepts, hovering only shows the name: fading the whole map on every pointer
// move would recompute every dot.
const HOVER_HIGHLIGHT_LIMIT = 6000;

function mix(color: string, target: string, amount: number) {
  const parse = (value: string) => {
    const hex = value.replace("#", "");
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  };
  const from = parse(color);
  const to = parse(target);
  const channels = from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function conceptMapNodeSize(degree: number) {
  return Math.min(15, 2.6 + Math.sqrt(degree) * 1.75);
}

/** Levels of detail drawn at a camera ratio (1: whole map). */
export function conceptMapLevelForRatio(ratio: number) {
  return Math.max(0, Math.floor(Math.log2(1 / Math.max(ratio, 1e-6)) + 0.35));
}

export function createConceptMapRenderer(
  container: HTMLElement,
  callbacks: ConceptMapRendererCallbacks,
  options: {
    reducedMotion: boolean;
    fontFamily: string;
    /** Areas covered by overlaid controls, in stage pixels: labels are not placed there. */
    reservedAreas?: () => { left: number; top: number; right: number; bottom: number }[];
    /** Translated domain names, shown over their region when zoomed out. */
    domainName?: (index: number) => string | undefined;
    serifFamily?: string;
  }
): ConceptMapRenderer {
  const graph = new Graph({ type: "undirected", multi: false, allowSelfLoops: false });
  let data: ConceptMapRendererData | null = null;
  let colors: string[] = [];
  let fadedColors: string[] = [];
  let stubColors: string[] = [];
  const neighbors: Set<number>[] = [];
  const edgeEnds = new Map<string, [number, number]>();
  const nodesByLevel: string[][] = [];
  const edgesByLevel: string[][] = [];
  const domainCenters: { x: number; y: number; count: number }[] = [];
  let domainOrder: number[] = [];

  const state: ConceptMapRendererState & { level: number } = {
    selected: null,
    hovered: null,
    matches: null,
    hiddenDomains: new Set(),
    level: 0
  };
  const focusNode = () => state.hovered ?? state.selected;
  const forced = (index: number) => {
    const focused = focusNode();
    return index === state.selected || (focused !== null && (index === focused || neighbors[focused]?.has(index))) || Boolean(state.matches?.has(index));
  };
  const hiddenByLevel = (index: number) => data !== null && data.level[index] > state.level && !forced(index);

  // Dots and lines are sized for the density on screen, which the levels of detail keep about
  // constant: on a large map they stay the same size while zooming, until every concept is shown.
  let densityScale = 1;
  let detailRatio = 1;
  const zoomToSizeRatio = (ratio: number) =>
    (ratio >= 1 ? Math.sqrt(ratio) : Math.sqrt(Math.min(ratio, detailRatio) / detailRatio)) / densityScale;

  const labelRequests: LabelRequest[] = [];
  // measureText is comparatively slow and labels are redrawn on every frame of a zoom.
  const textWidths = new Map<string, number>();
  const fontFamily = options.fontFamily || "Inter, system-ui, sans-serif";

  const settings: Partial<Settings> = {
    allowInvalidContainer: true,
    defaultEdgeColor: EDGE,
    labelFont: fontFamily,
    labelSize: 12,
    labelWeight: "500",
    labelColor: { color: INK },
    labelDensity: 0.9,
    labelGridCellSize: 110,
    labelRenderedSizeThreshold: 7.5,
    minEdgeThickness: 0.8,
    stagePadding: 24,
    zIndex: true,
    zoomToSizeRatioFunction: zoomToSizeRatio,
    minCameraRatio: 0.01,
    maxCameraRatio: 2.5,
    zoomDuration: options.reducedMotion ? 0 : 250,
    doubleClickZoomingDuration: options.reducedMotion ? 0 : 200,
    inertiaDuration: options.reducedMotion ? 0 : 200,
    // Labels are collected here and drawn after the frame, most important first, so that
    // they never overlap (see drawCollectedLabels).
    defaultDrawNodeLabel: (_context, display) => {
      if (!display.label) return;
      const index = Number(display.key);
      const priority = index === state.selected ? 3 : state.matches?.has(index) ? 2 : display.forceLabel ? 1 : 0;
      labelRequests.push({ index, x: display.x, y: display.y, size: display.size, label: display.label, priority, strong: priority > 0 });
    },
    defaultDrawNodeHover: (context, display) => {
      // Sigma also calls this for a selected/highlighted node. Its name already
      // has a reserved place on the labels canvas; avoid a second, clipped pill.
      if (Number(display.key) === state.selected) return;
      drawHover(context, display, fontFamily);
    },
    nodeReducer: (node, attributes) => {
      const index = Number(node);
      const domain = attributes.domain as number;
      if (state.hiddenDomains.has(domain) || hiddenByLevel(index)) return { ...attributes, hidden: true };
      if (index === state.selected) return { ...attributes, highlighted: true, forceLabel: true, zIndex: 4 };
      const focused = focusNode();
      if (focused !== null) {
        if (index === focused) return { ...attributes, highlighted: true, forceLabel: true, zIndex: 4 };
        if (neighbors[focused]?.has(index)) return { ...attributes, forceLabel: true, zIndex: 3 };
        return { ...attributes, color: fadedColors[domain], label: "", zIndex: 0 };
      }
      if (state.matches) {
        if (state.matches.has(index)) return { ...attributes, zIndex: 3 };
        return { ...attributes, color: fadedColors[domain], label: "", zIndex: 0 };
      }
      return attributes;
    },
    edgeReducer: (edge, attributes) => {
      const [source, target] = edgeEnds.get(edge)!;
      const domains = data!.domain;
      if (state.hiddenDomains.has(domains[source]) || state.hiddenDomains.has(domains[target]) || hiddenByLevel(source) || hiddenByLevel(target)) {
        return { ...attributes, hidden: true };
      }
      const focused = focusNode();
      if (focused !== null) {
        return source === focused || target === focused
          ? { ...attributes, color: EDGE_HIGHLIGHT, size: 1.4, zIndex: 2 }
          : { ...attributes, color: FADED_EDGE, zIndex: 0 };
      }
      if (state.matches) {
        return state.matches.has(source) && state.matches.has(target) ? attributes : { ...attributes, color: FADED_EDGE };
      }
      return attributes;
    }
  };

  const renderer = new Sigma(graph, container, settings);
  const camera = renderer.getCamera();
  state.level = conceptMapLevelForRatio(camera.ratio);

  function drawCollectedLabels() {
    const context = renderer.getCanvases().labels.getContext("2d");
    if (!context) return;
    const pixelRatio = window.devicePixelRatio || 1;
    context.save();
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.textBaseline = "middle";
    context.lineJoin = "round";
    labelRequests.sort((left, right) => right.priority - left.priority || right.size - left.size);
    const viewport = renderer.getDimensions();
    const compact = viewport.width <= 600;
    const ratio = camera.ratio;
    const selected = state.selected;
    // Only domain names at overview scale. Selection keeps its own name and a few
    // neighbours at any zoom; hover uses Sigma's separate tooltip canvas.
    const budget = selected !== null ? (compact ? 4 : 6)
      : ratio >= 0.7 ? 0
      : state.matches ? (compact ? 3 : 5)
      : ratio >= 0.3 ? (compact ? 4 : 10) : (compact ? 10 : 24);
    const alpha = selected !== null ? 1 : Math.min(1, Math.max(0, (0.7 - ratio) / 0.15));
    const breathingRoom = ratio >= 0.3 ? 12 : 8;
    let drawn = 0;
    const placed: Box[] = (options.reservedAreas?.() ?? []).map((area) => [area.left, area.top, area.right, area.bottom]);
    drawDomainNames(context, viewport, placed);
    context.globalAlpha = alpha;
    const overlaps = (box: Box) => placed.some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1]);
    for (const request of labelRequests) {
      if (drawn >= budget) break;
      if (selected !== null && request.index !== selected && !neighbors[selected]?.has(request.index)) continue;
      const fontSize = request.strong ? 13 : request.size > 9 ? 12.5 : 11.5;
      context.font = `${request.strong || request.size > 9 ? 650 : 500} ${fontSize}px ${fontFamily}`;
      const fontKey = `${context.font}\u0000${request.label}`;
      let width = textWidths.get(fontKey);
      if (width === undefined) {
        width = context.measureText(request.label).width;
        if (textWidths.size > 50000) textWidths.clear();
        textWidths.set(fontKey, width);
      }
      const height = fontSize * 1.3;
      const gap = request.size + 4;
      // Right of the dot first, then left, above and below: the first free spot wins.
      const candidates: [x: number, y: number][] = [
        [request.x + gap, request.y],
        [request.x - gap - width, request.y],
        [request.x - width / 2, request.y - gap - height / 2],
        [request.x - width / 2, request.y + gap + height / 2]
      ];
      let chosen: [number, number] | null = null;
      for (const [x, y] of candidates) {
        const box: Box = [x - breathingRoom, y - height / 2 - 7, x + width + breathingRoom, y + height / 2 + 7];
        const inside = box[0] >= 0 && box[2] <= viewport.width && box[1] >= 0 && box[3] <= viewport.height;
        if (inside && !overlaps(box)) {
          chosen = [x, y];
          placed.push(box);
          break;
        }
      }
      // The selected concept is always labelled; other labels give way rather than overlap.
      if (!chosen) {
        if (request.priority < 3) continue;
        chosen = candidates[0];
      }
      context.lineWidth = 3.2;
      context.strokeStyle = "rgba(248, 244, 234, 0.92)";
      context.strokeText(request.label, chosen[0], chosen[1]);
      context.fillStyle = INK;
      context.fillText(request.label, chosen[0], chosen[1]);
      drawn += 1;
    }
    context.restore();
    labelRequests.length = 0;
  }

  function drawDomainNames(context: CanvasRenderingContext2D, viewport: { width: number; height: number }, placed: Box[]) {
    const ratio = camera.ratio;
    if (!data || !options.domainName || ratio < 0.7 || state.selected !== null || state.hovered !== null || state.matches) return;
    // Only on the overview: once zoomed in, concept names take over.
    const alpha = Math.min(1, (ratio - 0.7) / 0.25) * 0.7;
    const total = domainCenters.reduce((sum, center) => sum + center.count, 0);
    const minimumSize = Math.max(5, total * 0.03);
    context.font = `italic 600 15px ${options.serifFamily || "Georgia, serif"}`;
    const budget = viewport.width <= 600 ? 3 : 6;
    let drawn = 0;
    for (const index of domainOrder) {
      if (drawn >= budget) break;
      const center = domainCenters[index];
      const name = options.domainName(index);
      if (!center || center.count < minimumSize || !name || state.hiddenDomains.has(index)) continue;
      const point = renderer.graphToViewport({ x: center.x / center.count, y: center.y / center.count });
      const width = context.measureText(name).width;
      const box: Box = [point.x - width / 2 - 18, point.y - 22, point.x + width / 2 + 18, point.y + 22];
      if (box[0] < 0 || box[2] > viewport.width || box[1] < 0 || box[3] > viewport.height) continue;
      if (placed.some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) continue;
      drawn += 1;
      placed.push(box);
      context.globalAlpha = alpha;
      context.textAlign = "center";
      context.lineWidth = 4;
      context.strokeStyle = "#f8f4ea";
      context.strokeText(name, point.x, point.y);
      context.fillStyle = mix(data.domains[index].color, "#22201d", 0.25);
      context.fillText(name, point.x, point.y);
    }
    context.globalAlpha = 1;
    context.textAlign = "start";
  }

  renderer.on("afterRender", drawCollectedLabels);
  renderer.on("beforeRender", () => {
    labelRequests.length = 0;
  });
  renderer.on("clickNode", ({ node }) => callbacks.onSelect(Number(node)));
  renderer.on("clickStage", () => callbacks.onSelect(null));
  renderer.on("doubleClickNode", (event) => {
    event.preventSigmaDefault();
    callbacks.onOpen(Number(event.node));
  });
  renderer.on("enterNode", ({ node }) => {
    container.style.cursor = "pointer";
    callbacks.onHover(Number(node));
  });
  renderer.on("leaveNode", () => {
    container.style.cursor = "";
    callbacks.onHover(null);
  });

  // Level of detail follows the camera. Showing or hiding a level only reprocesses its own dots
  // and lines; the label index is rebuilt once the camera has settled.
  let indexedLevel = state.level;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let announcedLevel = -1;
  const announceLevel = (ratio: number) => {
    const ahead = conceptMapLevelForRatio(ratio / 2);
    if (ahead <= announcedLevel) return;
    announcedLevel = ahead;
    callbacks.onLevel?.(ahead);
  };
  camera.on("updated", (cameraState) => {
    announceLevel(cameraState.ratio);
    const level = conceptMapLevelForRatio(cameraState.ratio);
    if (level === state.level) return;
    const low = Math.min(level, state.level);
    const high = Math.max(level, state.level);
    state.level = level;
    const nodes: string[] = [];
    const edges: string[] = [];
    for (let value = low + 1; value <= high; value += 1) {
      if (nodesByLevel[value]) nodes.push(...nodesByLevel[value]);
      if (edgesByLevel[value]) edges.push(...edgesByLevel[value]);
    }
    if (nodes.length || edges.length) renderer.refresh({ partialGraph: { nodes, edges }, skipIndexation: true, schedule: true });
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (indexedLevel !== state.level) {
        indexedLevel = state.level;
        renderer.refresh();
      }
    }, 220);
  });

  // Sigma renders once in its constructor, before the listeners above existed.
  renderer.refresh();

  const duration = options.reducedMotion ? 0 : 320;
  const updateDensity = () => {
    if (!data) return;
    const { width, height } = renderer.getDimensions();
    // Typical distance between the dots of the overview, in pixels.
    const spacing = Math.sqrt((width * height) / Math.max(nodesByLevel[0]?.length ?? 1, 1));
    const scale = Math.min(1, Math.max(0.45, spacing / 34));
    detailRatio = Math.min(1, 2 ** -(data.maxLevel - 0.35));
    if (scale === densityScale) return;
    densityScale = scale;
    renderer.setSetting("labelRenderedSizeThreshold", 7.5 * scale);
    // Dense maps get lighter lines, closer to the paper.
    renderer.setSetting("defaultEdgeColor", mix(EDGE, "#f7f3ea", (1 - scale) * 0.8));
  };
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          renderer.resize();
          updateDensity();
        });
  resizeObserver?.observe(container);

  return {
    addNodes(next, from, links) {
      // The extent of the whole map is known from the start: the view does not move when the
      // less important concepts arrive.
      if (!data) renderer.setCustomBBox(next.bounds);
      data = next;
      colors = next.domains.map((domain) => domain.color);
      fadedColors = colors.map((color) => mix(color, "#f1ebdc", 0.82));
      stubColors = colors.map((color) => mix(color, "#f8f4ea", 0.42));
      for (let index = from; index < next.x.length; index += 1) {
        const level = next.level[index];
        neighbors[index] = neighbors[index] ?? new Set();
        graph.addNode(String(index), {
          x: next.x[index],
          y: next.y[index],
          size: conceptMapNodeSize(next.degree[index]),
          label: next.label[index],
          color: next.status[index] === STUB_STATUS ? stubColors[next.domain[index]] : colors[next.domain[index]],
          domain: next.domain[index],
          // Hubs above small concepts.
          zIndex: 1 + Math.min(next.degree[index], 60) / 61
        });
        (nodesByLevel[level] = nodesByLevel[level] ?? []).push(String(index));
        const center = (domainCenters[next.domain[index]] = domainCenters[next.domain[index]] ?? { x: 0, y: 0, count: 0 });
        center.x += next.x[index];
        center.y += next.y[index];
        center.count += 1;
      }
      for (let index = 0; index < links.length; index += 2) {
        const source = links[index];
        const target = links[index + 1];
        neighbors[source].add(target);
        neighbors[target].add(source);
        const low = Math.min(source, target);
        const high = Math.max(source, target);
        const key = `${low}-${high}`;
        if (edgeEnds.has(key)) continue;
        // Citations in both directions share one line; the panel lists the direction.
        edgeEnds.set(key, [low, high]);
        graph.addUndirectedEdgeWithKey(key, String(low), String(high), { size: 1.1 });
        const level = Math.max(next.level[low], next.level[high]);
        (edgesByLevel[level] = edgesByLevel[level] ?? []).push(key);
      }
      domainOrder = domainCenters.map((_, index) => index).sort((left, right) => (domainCenters[right]?.count ?? 0) - (domainCenters[left]?.count ?? 0));
      indexedLevel = state.level;
      if (from === 0) updateDensity();
      renderer.refresh();
      if (from === 0) announceLevel(camera.getState().ratio);
    },
    update(partial) {
      // Large maps: the hover box shows the name, without refading the whole map.
      if ("hovered" in partial && Object.keys(partial).length === 1 && graph.order > HOVER_HIGHLIGHT_LIMIT) return;
      Object.assign(state, partial);
      indexedLevel = state.level;
      renderer.refresh();
    },
    focus(node, focusOptions = {}) {
      const display = renderer.getNodeDisplayData(String(node));
      if (!display || !data) return;
      const { width, height } = renderer.getDimensions();
      const inset = Math.min(focusOptions.bottomInset ?? 0, height * 0.8);
      let ratio = camera.ratio;
      if (focusOptions.zoom !== false) {
        // Zoom so that the concept and its direct neighbors fit in the view…
        let extent = 0.06;
        for (const neighbor of neighbors[node] ?? []) {
          const other = renderer.getNodeDisplayData(String(neighbor));
          if (other) extent = Math.max(extent, Math.abs(other.x - display.x), Math.abs(other.y - display.y));
        }
        const aspect = Math.min(width, height) / Math.max(width, height, 1);
        ratio = (extent * 2.3) / Math.max(aspect, 0.4);
        if (inset > 0) ratio *= height / (height - inset);
        // …and close enough for its own level of detail to be drawn around it.
        ratio = Math.min(1, 2 ** -(data.level[node] - 0.3), Math.max(0.02, ratio));
      }
      let target = { x: display.x, y: display.y };
      if (inset > 0) {
        // Center the concept in the part of the map left visible above a bottom sheet.
        target = renderer.viewportToFramedGraph(
          { x: width / 2, y: height / 2 + inset / 2 },
          { cameraState: { x: display.x, y: display.y, ratio, angle: camera.angle } }
        );
      }
      camera.animate({ ...target, ratio }, { duration });
    },
    zoomIn: () => camera.animatedZoom({ duration }),
    zoomOut: () => camera.animatedUnzoom({ duration }),
    reset: () => camera.animatedReset({ duration }),
    pan(dx, dy) {
      const current = camera.getState();
      camera.animate({ x: current.x + dx * current.ratio, y: current.y + dy * current.ratio }, { duration: options.reducedMotion ? 0 : 120 });
    },
    resize: () => {
      renderer.resize();
      updateDensity();
    },
    getCamera: () => {
      const current = camera.getState();
      return { x: current.x, y: current.y, ratio: current.ratio };
    },
    setCamera: (next) => camera.setState(next),
    destroy() {
      if (settleTimer) clearTimeout(settleTimer);
      resizeObserver?.disconnect();
      renderer.kill();
      graph.clear();
    }
  };
}

function drawHover(
  context: CanvasRenderingContext2D,
  display: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">,
  fontFamily: string
) {
  const label = display.label ?? "";
  const fontSize = 13;
  context.font = `650 ${fontSize}px ${fontFamily}`;
  const width = label ? context.measureText(label).width : 0;
  const padding = 6;
  const height = fontSize + padding * 2;
  const left = display.x - display.size - padding;
  const top = display.y - height / 2;
  const boxWidth = label ? display.size * 2 + width + padding * 3 + 2 : display.size * 2 + padding * 2;
  context.save();
  context.shadowColor = "rgba(24, 39, 29, 0.22)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 2;
  context.fillStyle = "#fdfaf3";
  context.strokeStyle = "#226a46";
  context.lineWidth = 1.2;
  const radius = height / 2;
  context.beginPath();
  context.moveTo(left + radius, top);
  context.lineTo(left + boxWidth - radius, top);
  context.arc(left + boxWidth - radius, top + radius, radius, -Math.PI / 2, Math.PI / 2);
  context.lineTo(left + radius, top + height);
  context.arc(left + radius, top + radius, radius, Math.PI / 2, (Math.PI * 3) / 2);
  context.closePath();
  context.fill();
  context.shadowColor = "transparent";
  context.stroke();
  context.fillStyle = display.color;
  context.beginPath();
  context.arc(display.x, display.y, display.size, 0, Math.PI * 2);
  context.fill();
  if (label) {
    context.fillStyle = INK;
    context.textBaseline = "middle";
    context.fillText(label, display.x + display.size + padding, display.y);
  }
  context.restore();
}
