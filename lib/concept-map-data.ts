import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { renderInlineMarkdown } from "@/lib/markdown";
import { ACTIVE_CONTENT_LANGUAGES, parseActiveContentLanguage } from "@/lib/languages";
import {
  conceptMapGraphSteps,
  conceptMapPayloadSteps,
  conceptMapSignatureSteps,
  prepareConceptMapSteps,
  runConceptMapStepsSliced,
  type ConceptMapGraph,
  type ConceptMapLayout,
  type ConceptMapPayload,
  type ConceptMapPrepared,
  type ConceptMapRows
} from "@/lib/concept-map";
import { approximateConceptMapLayout, computeConceptMapLayout } from "@/lib/concept-map-layout";
import { conceptTitleNeedsRichRendering } from "@/lib/concept-map-text";

// Server-side cache of the concept maps (one per content language).
// - A cheap "stamp" (counts and latest ids/dates) is read at most every STAMP_TTL_MS; the rows are
//   only reloaded when it changes.
// - The layout, the expensive part, is only recomputed when the structure of a map (its concepts,
//   their domains and their links) changes. Meanwhile, requests get the previous positions at once.
// - warmConceptMaps() computes everything at server start (instrumentation.ts).

const STAMP_TTL_MS = 15_000;
const MAX_PAYLOADS = 8;

/** 1-based; see buildConceptMapPayload. */
export type ConceptMapTier = number;

/** Upper bound of the tier parameter (levels of detail stop at 8). */
export const CONCEPT_MAP_MAX_TIER = 10;

export type ConceptMapResponse = {
  body: string;
  etag: string;
  provisional: boolean;
};

type LoadedRows = { stamp: string; rows: ConceptMapRows };

type BuiltGraph = { graph: ConceptMapGraph; signature: string };

type LanguageState = {
  graph?: { rows: ConceptMapRows; promise: Promise<BuiltGraph> };
  layout?: ConceptMapLayout;
  /** Placeholder positions served while `pending` is computed. */
  approximate?: ConceptMapLayout;
  pending?: { signature: string; promise: Promise<ConceptMapLayout> };
  prepared?: { key: string; promise: Promise<ConceptMapPrepared> };
};

type ConceptMapCache = {
  stamp?: { checkedAt: number; promise: Promise<string> };
  rows?: { stamp: string; promise: Promise<LoadedRows> };
  languages: Map<string, LanguageState>;
  payloads: Map<string, ConceptMapResponse>;
  building: Map<string, Promise<ConceptMapResponse>>;
  titleHtml: Map<string, string>;
};

const globalForConceptMap = globalThis as unknown as { conceptMapCache?: ConceptMapCache };
const cache: ConceptMapCache =
  globalForConceptMap.conceptMapCache ?? { languages: new Map(), payloads: new Map(), building: new Map(), titleHtml: new Map() };
globalForConceptMap.conceptMapCache = cache;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

function forget<T>(promise: Promise<T>, clear: () => void) {
  promise.catch(() => clear());
  return promise;
}

async function readStamp() {
  // Saving a concept rewrites its InternalLink rows (new ids) and touches its updatedAt.
  const [concepts, aliases, redirects, links] = await Promise.all([
    prisma.concept.aggregate({ _count: { _all: true }, _max: { id: true, updatedAt: true } }),
    prisma.conceptAlias.aggregate({ _count: { _all: true }, _max: { id: true } }),
    prisma.conceptRedirect.aggregate({ _count: { _all: true }, _max: { id: true } }),
    prisma.internalLink.aggregate({ where: { sourceType: "CONCEPT" }, _count: { _all: true }, _max: { id: true } })
  ]);
  return JSON.stringify([
    concepts._count._all, concepts._max.id, concepts._max.updatedAt?.toISOString() ?? null,
    aliases._count._all, aliases._max.id,
    redirects._count._all, redirects._max.id,
    links._count._all, links._max.id
  ]);
}

function currentStamp() {
  if (!cache.stamp || Date.now() - cache.stamp.checkedAt > STAMP_TTL_MS) {
    const promise: Promise<string> = forget(readStamp(), () => {
      if (cache.stamp?.promise === promise) cache.stamp = undefined;
    });
    cache.stamp = { checkedAt: Date.now(), promise };
  }
  return cache.stamp.promise;
}

const BATCH_SIZE = 10_000;

/** Reads a large table in batches, so that decoding tens of thousands of rows never blocks for long. */
async function readInBatches<T extends { id: number }>(read: (after: number | undefined) => Promise<T[]>) {
  const rows: T[] = [];
  let after: number | undefined;
  for (;;) {
    const batch = await read(after);
    for (const row of batch) rows.push(row);
    if (batch.length < BATCH_SIZE) return rows;
    after = batch[batch.length - 1].id;
    await yieldToEventLoop();
  }
}

async function loadConceptMapRows(): Promise<ConceptMapRows> {
  const [concepts, redirects, links] = await Promise.all([
    readInBatches((after) =>
      prisma.concept.findMany({
        ...(after === undefined ? {} : { where: { id: { gt: after } } }),
        select: {
          id: true,
          slug: true,
          title: true,
          language: true,
          translationGroupId: true,
          translatedFromConceptId: true,
          status: true,
          kind: true,
          domainCode: true,
          aliases: { select: { alias: true, aliasSlug: true } }
        },
        orderBy: { id: "asc" },
        take: BATCH_SIZE
      })
    ),
    prisma.conceptRedirect.findMany({
      select: { sourceSlug: true, targetConceptId: true, isRename: true },
      orderBy: { id: "asc" }
    }),
    readInBatches((after) =>
      prisma.internalLink.findMany({
        where: after === undefined ? { sourceType: "CONCEPT" } : { sourceType: "CONCEPT", id: { gt: after } },
        select: { id: true, sourceId: true, targetSlug: true },
        orderBy: { id: "asc" },
        take: BATCH_SIZE
      })
    )
  ]);
  return { concepts, redirects, links };
}

async function currentRows(): Promise<LoadedRows> {
  const stamp = await currentStamp();
  if (cache.rows?.stamp !== stamp) {
    const promise: Promise<LoadedRows> = forget(
      loadConceptMapRows().then((rows) => ({ stamp, rows })),
      () => {
        if (cache.rows?.promise === promise) cache.rows = undefined;
      }
    );
    cache.rows = { stamp, promise };
  }
  return cache.rows.promise;
}

function languageState(language: string) {
  let state = cache.languages.get(language);
  if (!state) {
    state = {};
    cache.languages.set(language, state);
  }
  return state;
}


async function layoutFor(state: LanguageState, graph: ConceptMapGraph, signature: string): Promise<ConceptMapLayout> {
  if (state.layout?.signature === signature) return state.layout;
  if (state.pending?.signature !== signature) {
    const promise: Promise<ConceptMapLayout> = forget(
      computeConceptMapLayout(graph, { yieldControl: yieldToEventLoop, signature }).then((layout) => {
        // Keep the newest structure only; an older computation finishing late is ignored.
        if (state.pending?.promise === promise) {
          state.layout = layout;
          state.pending = undefined;
          state.approximate = undefined;
        }
        return layout;
      }),
      () => {
        if (state.pending?.promise === promise) state.pending = undefined;
      }
    );
    state.pending = { signature, promise };
  }
  // While a new layout is computed, answer immediately from the previous one.
  if (state.layout) {
    if (state.approximate?.signature !== signature) state.approximate = approximateConceptMapLayout(graph, state.layout, signature);
    return state.approximate;
  }
  return state.pending.promise;
}

async function titleHtmlFor(payload: ConceptMapPayload) {
  const titleHtml: Record<number, string> = {};
  let sliceStartedAt = performance.now();
  for (const [index, title] of Object.entries(payload.nodes.title)) {
    if (!conceptTitleNeedsRichRendering(title)) continue;
    let html = cache.titleHtml.get(title);
    if (html === undefined) {
      html = await renderInlineMarkdown(title);
      if (cache.titleHtml.size > 20000) cache.titleHtml.clear();
      cache.titleHtml.set(title, html);
    }
    titleHtml[Number(index)] = html;
    // KaTeX is synchronous: render the titles in slices too.
    if (performance.now() - sliceStartedAt > 8) {
      await yieldToEventLoop();
      sliceStartedAt = performance.now();
    }
  }
  return titleHtml;
}

// Every step runs in slices of about 8 ms, so other requests are served while a map is built
// (only JSON.stringify of the second tier, about 70 ms on 40,000 concepts, runs in one go).
function graphFor(state: LanguageState, rows: ConceptMapRows, language: string) {
  if (state.graph?.rows !== rows) {
    const promise: Promise<BuiltGraph> = forget(
      (async () => {
        const graph = await runConceptMapStepsSliced(conceptMapGraphSteps(rows, language), yieldToEventLoop);
        return { graph, signature: await runConceptMapStepsSliced(conceptMapSignatureSteps(graph), yieldToEventLoop) };
      })(),
      () => {
        if (state.graph?.promise === promise) state.graph = undefined;
      }
    );
    state.graph = { rows, promise };
  }
  return state.graph.promise;
}

function preparedFor(state: LanguageState, key: string, graph: ConceptMapGraph, layout: ConceptMapLayout) {
  if (state.prepared?.key !== key) {
    const promise: Promise<ConceptMapPrepared> = forget(
      runConceptMapStepsSliced(prepareConceptMapSteps(graph, layout), yieldToEventLoop),
      () => {
        if (state.prepared?.promise === promise) state.prepared = undefined;
      }
    );
    state.prepared = { key, promise };
  }
  return state.prepared.promise;
}

async function buildResponse(prepared: ConceptMapPrepared, tier: ConceptMapTier): Promise<ConceptMapResponse> {
  const payload = await runConceptMapStepsSliced(conceptMapPayloadSteps(prepared, tier), yieldToEventLoop);
  const titleHtml = await titleHtmlFor(payload);
  await yieldToEventLoop();
  const body = JSON.stringify({ ...payload, titleHtml });
  return {
    body,
    etag: `"cm-${createHash("sha1").update(body).digest("base64url").slice(0, 24)}"`,
    provisional: payload.provisional
  };
}

export async function getConceptMapResponse(requestedLanguage: string, tier: ConceptMapTier = 1): Promise<ConceptMapResponse> {
  const language = parseActiveContentLanguage(requestedLanguage);
  const { stamp, rows } = await currentRows();
  const state = languageState(language);
  const { graph, signature } = await graphFor(state, rows, language);
  const layout = await layoutFor(state, graph, signature);
  const preparedKey = `${stamp}:${layout.signature}:${layout.provisional ? "p" : "f"}`;
  const key = `${language}:${tier}:${preparedKey}`;
  const cached = cache.payloads.get(key);
  if (cached) return cached;

  let building = cache.building.get(key);
  if (!building) {
    building = preparedFor(state, preparedKey, graph, layout).then((prepared) => buildResponse(prepared, tier));
    cache.building.set(key, building);
    const settle = () => {
      if (cache.building.get(key) === building) cache.building.delete(key);
    };
    building.then(
      (response) => {
        settle();
        // Provisional answers are cached too: their key changes as soon as the layout is ready.
        if (cache.payloads.size >= MAX_PAYLOADS) cache.payloads.delete(cache.payloads.keys().next().value!);
        cache.payloads.set(key, response);
      },
      settle
    );
  }
  return building;
}

/** Computes the maps without waiting for a visitor (server start, map page render). */
export async function warmConceptMaps(languages: readonly string[] = ACTIVE_CONTENT_LANGUAGES.map(({ code }) => code)) {
  for (const language of languages) {
    try {
      const first = JSON.parse((await getConceptMapResponse(language, 1)).body) as Pick<ConceptMapPayload, "tiers">;
      for (let tier = 2; tier <= first.tiers.length; tier += 1) await getConceptMapResponse(language, tier);
    } catch (error) {
      const reason = error instanceof Error ? error.message.split("\n").filter(Boolean).pop() : String(error);
      console.warn(`Concept map warm-up skipped (${language}): ${reason}`);
      return;
    }
  }
}
