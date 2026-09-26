// Measures the server side of the /concepts map on the LOCAL database (read-only):
//   node --experimental-strip-types scripts/concept-map-benchmark.mjs [--lang fr]
// Use scripts/concept-map-fixture.mjs first to get a graph of the size to study.
import { gzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { buildConceptMapGraph, buildConceptMapPayload, prepareConceptMap } from "../lib/concept-map.ts";
import { computeConceptMapLayout } from "../lib/concept-map-layout.ts";

const languageFlag = process.argv.indexOf("--lang");
const language = languageFlag > 0 ? process.argv[languageFlag + 1] : "fr";

const prisma = new PrismaClient();
const queryStartedAt = performance.now();
const [concepts, redirects, links] = await Promise.all([
  prisma.concept.findMany({
    select: { id: true, slug: true, title: true, language: true, translationGroupId: true, translatedFromConceptId: true, status: true, kind: true, domainCode: true, aliases: { select: { alias: true, aliasSlug: true } } }
  }),
  prisma.conceptRedirect.findMany({ select: { sourceSlug: true, targetConceptId: true, isRename: true } }),
  prisma.internalLink.findMany({ where: { sourceType: "CONCEPT" }, select: { sourceId: true, targetSlug: true } })
]);
const queryMs = performance.now() - queryStartedAt;
await prisma.$disconnect();

const buildStartedAt = performance.now();
const graph = buildConceptMapGraph({ concepts, redirects, links }, language);
const buildMs = performance.now() - buildStartedAt;

// Same slicing as the server: record the longest pause imposed on other requests.
let last = performance.now();
let longestStall = 0;
const probe = setInterval(() => {
  const now = performance.now();
  longestStall = Math.max(longestStall, now - last);
  last = now;
}, 1);
const layout = await computeConceptMapLayout(graph, { yieldControl: () => new Promise((resolve) => setImmediate(resolve)) });
clearInterval(probe);

const prepareStartedAt = performance.now();
const prepared = prepareConceptMap(graph, layout);
const prepareMs = performance.now() - prepareStartedAt;
const tiers = prepared.tiers.map((_, index) => {
  const startedAt = performance.now();
  const payload = buildConceptMapPayload(prepared, index + 1);
  const body = JSON.stringify(payload);
  return { payload, body, ms: performance.now() - startedAt };
});
const round = (value) => Math.round(value);
const levels = Array.from({ length: prepared.maxLevel + 1 }, (_, level) => prepared.levels.filter((value) => value <= level).length);
const table = {
  language: { value: language },
  concepts: { value: graph.nodes.length },
  citations: { value: graph.citations.length },
  "database rows read (ms)": { value: round(queryMs) },
  "graph build (ms)": { value: round(buildMs) },
  "layout CPU (ms)": { value: layout.computeMs },
  "layout wall clock (ms)": { value: layout.durationMs },
  "longest event-loop pause (ms)": { value: round(longestStall) },
  "levels, prepare (ms)": { value: round(prepareMs) },
  "concepts drawn per zoom level": { value: levels.join(" / ") }
};
tiers.forEach(({ payload, body, ms }, index) => {
  table[`tier ${index + 1}: concepts, build ms, kB, gzip kB`] = {
    value: [payload.nodes.slug.length, round(ms), round(body.length / 1024), round(gzipSync(body).length / 1024)].join(" / ")
  };
});
console.table(table);
