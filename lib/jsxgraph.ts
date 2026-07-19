export type JsxGraphValue = string | number | boolean | null | JsxGraphValue[] | { [key: string]: JsxGraphValue };

export type JsxGraphElementConfig = {
  id?: string;
  type: string;
  parents: JsxGraphValue[];
  attributes: Record<string, JsxGraphValue>;
};

export type JsxGraphAnimationConfig = {
  target: string;
  direction: 1 | -1;
  steps: number;
  delay: number;
  rounds: number;
  autoplay: boolean;
};

export type JsxGraphConfig = {
  boundingBox: [number, number, number, number];
  axis: boolean;
  grid: boolean;
  keepAspectRatio: boolean;
  height: number;
  elements: JsxGraphElementConfig[];
  animation: JsxGraphAnimationConfig | null;
};

export type JsxGraphParseResult =
  | { ok: true; config: JsxGraphConfig }
  | { ok: false; error: string };

const MAX_SOURCE_LENGTH = 50_000;
const MAX_ELEMENTS = 120;
const MAX_VALUE_DEPTH = 8;
const MAX_STRING_LENGTH = 2_000;

const ALLOWED_ELEMENT_TYPES = new Set([
  "angle",
  "arc",
  "arrow",
  "axis",
  "bisector",
  "bisectorlines",
  "boxplot",
  "cardinalspline",
  "chart",
  "circle",
  "circumcenter",
  "circumcircle",
  "circumcirclearc",
  "circumcirclesector",
  "comb",
  "conic",
  "curve",
  "curvedifference",
  "curveintersection",
  "curveunion",
  "derivative",
  "ellipse",
  "functiongraph",
  "glider",
  "grid",
  "hatch",
  "hyperbola",
  "incenter",
  "incircle",
  "inequality",
  "integral",
  "intersection",
  "line",
  "locus",
  "majorarc",
  "majorsector",
  "metapostspline",
  "midpoint",
  "minorarc",
  "minorsector",
  "normal",
  "parallel",
  "parabola",
  "perpendicular",
  "perpendicularpoint",
  "perpendicularsegment",
  "plot",
  "point",
  "polygon",
  "regularpolygon",
  "riemannsum",
  "sector",
  "segment",
  "semicircle",
  "slider",
  "slopefield",
  "slopetriangle",
  "spline",
  "stepfunction",
  "tangent",
  "tapemeasure",
  "ticks",
  "tracecurve",
  "transformation",
  "turtle",
  "vectorfield"
]);

const BLOCKED_ATTRIBUTE_KEYS = new Set([
  "content",
  "cssstyle",
  "events",
  "highlightcssstyle",
  "href",
  "html",
  "innerhtml",
  "src",
  "url",
  "usekatex",
  "usemathjax"
]);

const UNSAFE_STRING =
  /(?:javascript\s*:|data\s*:\s*text\/html|<\s*\/?\s*(?:script|iframe|object|embed)|\b(?:document|eval|fetch|Function|globalThis|import|prototype|self|WebSocket|window|XMLHttpRequest|__proto__|constructor)\b)/i;

export const JSXGRAPH_MARKDOWN_TEMPLATE = `\`\`\`jsxgraph
{
  "boundingBox": [-5, 5, 5, -5],
  "axis": true,
  "height": 360,
  "elements": [
    {
      "id": "a",
      "type": "slider",
      "parents": [[-4, 4], [1, 4], [-2, 1, 2]],
      "attributes": { "name": "a" }
    },
    {
      "type": "functiongraph",
      "parents": ["a*x^2"],
      "attributes": { "strokeColor": "#2f6f4e", "strokeWidth": 3 }
    }
  ]
}
\`\`\``;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number, label: string) {
  if (value === undefined) return fallback;
  const parsed = finiteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function optionalBoolean(value: unknown, fallback: boolean, label: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
  return value;
}

function safeString(value: string, label: string) {
  if (value.length > MAX_STRING_LENGTH) throw new Error(`${label} is too long.`);
  if (UNSAFE_STRING.test(value)) throw new Error(`${label} contains unsupported executable content.`);
  return value;
}

function safeValue(value: unknown, label: string, depth = 0): JsxGraphValue {
  if (depth > MAX_VALUE_DEPTH) throw new Error(`${label} is nested too deeply.`);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return finiteNumber(value, label);
  if (typeof value === "string") return safeString(value, label);

  if (Array.isArray(value)) {
    if (value.length > 240) throw new Error(`${label} contains too many values.`);
    return value.map((item, index) => safeValue(item, `${label}[${index}]`, depth + 1));
  }

  if (!isRecord(value)) throw new Error(`${label} contains an unsupported value.`);
  const entries = Object.entries(value);
  if (entries.length > 100) throw new Error(`${label} contains too many properties.`);

  const result: Record<string, JsxGraphValue> = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key)) {
      throw new Error(`${label} contains an invalid property name.`);
    }
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.startsWith("on") || BLOCKED_ATTRIBUTE_KEYS.has(normalizedKey)) {
      throw new Error(`${label}.${key} is not allowed.`);
    }
    result[key] = safeValue(item, `${label}.${key}`, depth + 1);
  }
  return result;
}

function parseBoundingBox(value: unknown): [number, number, number, number] {
  if (value === undefined) return [-5, 5, 5, -5];
  if (!Array.isArray(value) || value.length !== 4) {
    throw new Error("boundingBox must contain [left, top, right, bottom].");
  }
  const box = value.map((item, index) => finiteNumber(item, `boundingBox[${index}]`)) as [number, number, number, number];
  if (box[0] >= box[2] || box[1] <= box[3]) {
    throw new Error("boundingBox must have left < right and top > bottom.");
  }
  return box;
}

function parseElement(value: unknown, index: number): JsxGraphElementConfig {
  if (!isRecord(value)) throw new Error(`elements[${index}] must be an object.`);

  const type = typeof value.type === "string" ? value.type.trim().toLowerCase() : "";
  if (!ALLOWED_ELEMENT_TYPES.has(type)) {
    throw new Error(`elements[${index}].type is not a supported JSXGraph element.`);
  }
  if (!Array.isArray(value.parents)) throw new Error(`elements[${index}].parents must be an array.`);

  const id = value.id === undefined ? undefined : safeString(String(value.id).trim(), `elements[${index}].id`);
  if (id !== undefined && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)) {
    throw new Error(`elements[${index}].id must start with a letter and contain only letters, numbers, _ or -.`);
  }

  const attributesValue = value.attributes ?? {};
  if (!isRecord(attributesValue)) throw new Error(`elements[${index}].attributes must be an object.`);
  const attributes = safeValue(attributesValue, `elements[${index}].attributes`);
  if (!isRecord(attributes)) throw new Error(`elements[${index}].attributes must be an object.`);

  return {
    ...(id ? { id } : {}),
    type,
    parents: value.parents.map((parent, parentIndex) =>
      safeValue(parent, `elements[${index}].parents[${parentIndex}]`)
    ),
    attributes: attributes as Record<string, JsxGraphValue>
  };
}

function parseAnimation(value: unknown, elements: JsxGraphElementConfig[]): JsxGraphAnimationConfig | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error("animation must be an object.");

  const target = typeof value.target === "string" ? value.target.trim() : "";
  const targetElement = elements.find((element) => element.id === target);
  if (!targetElement || !["slider", "glider"].includes(targetElement.type)) {
    throw new Error("animation.target must be the id of a slider or glider element.");
  }

  if (value.direction !== undefined && value.direction !== -1 && value.direction !== 1) {
    throw new Error("animation.direction must be 1 or -1.");
  }
  const direction = value.direction === -1 ? -1 : 1;
  const rounds = value.rounds === -1 ? -1 : boundedInteger(value.rounds, -1, 1, 1_000, "animation.rounds");

  return {
    target,
    direction,
    steps: boundedInteger(value.steps, 180, 2, 2_000, "animation.steps"),
    delay: boundedInteger(value.delay, 33, 16, 5_000, "animation.delay"),
    rounds,
    autoplay: optionalBoolean(value.autoplay, true, "animation.autoplay")
  };
}

export function parseJsxGraphConfig(source: string): JsxGraphParseResult {
  if (source.length > MAX_SOURCE_LENGTH) return { ok: false, error: "This graph configuration is too large." };

  try {
    const raw = JSON.parse(source) as unknown;
    if (!isRecord(raw)) throw new Error("The JSXGraph block must contain one JSON object.");
    if (!Array.isArray(raw.elements) || raw.elements.length === 0) {
      throw new Error("elements must contain at least one JSXGraph element.");
    }
    if (raw.elements.length > MAX_ELEMENTS) throw new Error(`A graph can contain at most ${MAX_ELEMENTS} elements.`);

    const elements = raw.elements.map(parseElement);
    const ids = elements.flatMap((element) => element.id ? [element.id] : []);
    if (new Set(ids).size !== ids.length) throw new Error("Element ids must be unique inside a graph.");

    const height = raw.height === undefined ? 360 : finiteNumber(raw.height, "height");
    if (height < 220 || height > 720) throw new Error("height must be between 220 and 720 pixels.");

    return {
      ok: true,
      config: {
        boundingBox: parseBoundingBox(raw.boundingBox),
        axis: optionalBoolean(raw.axis, false, "axis"),
        grid: optionalBoolean(raw.grid, false, "grid"),
        keepAspectRatio: optionalBoolean(raw.keepAspectRatio, true, "keepAspectRatio"),
        height,
        elements,
        animation: parseAnimation(raw.animation, elements)
      }
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSXGraph configuration." };
  }
}

export function encodeJsxGraphConfig(config: JsxGraphConfig) {
  return encodeURIComponent(JSON.stringify(config));
}

export function decodeJsxGraphConfig(encoded: string): JsxGraphParseResult {
  try {
    return parseJsxGraphConfig(decodeURIComponent(encoded));
  } catch {
    return { ok: false, error: "Invalid encoded JSXGraph configuration." };
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}

export function jsxGraphCodeBlockHtml(source: string) {
  const parsed = parseJsxGraphConfig(source);
  if (!parsed.ok) {
    return `<div class="jsxgraph-error" role="note"><strong>Graph could not be rendered.</strong><span>${escapeHtml(parsed.error)}</span></div>`;
  }

  return `<div class="jsxgraph-embed" data-jsxgraph="${encodeJsxGraphConfig(parsed.config)}" role="group" aria-label="Interactive mathematical graph"><span class="jsxgraph-loading">Loading interactive graph...</span></div>`;
}
