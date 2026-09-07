import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as names from "../lib/mathematician-names.ts";
import * as portraits from "../lib/portrait.ts";
import * as related from "../lib/mathematician-related.ts";
import * as limits from "../lib/content-limits.ts";
const { mathematicianName, normalizeMathematicianName, parseMathematicianAliases, rankMathematicians } = names;

const people = [
  { id: 1, name: "Euclid", aliases: ["Euclides"], translations: [{ language: "fr", displayName: "Euclide" }, { language: "en", displayName: "Euclid" }] },
  { id: 2, name: "Élie Cartan", aliases: [], translations: [{ language: "fr", displayName: "Élie Cartan" }] },
  { id: 3, name: "Emmy Noether", aliases: ["Amalie Emmy Noether"], translations: [] },
  { id: 4, name: "Jean d'Alembert", aliases: [], translations: [] },
  { id: 5, name: "Élie Cartan", aliases: [], translations: [] }
];

test("names use the selected language and preserve the fallback", () => {
  assert.equal(mathematicianName(people[0], "fr"), "Euclide");
  assert.equal(mathematicianName(people[0], "en"), "Euclid");
  assert.equal(mathematicianName(people[2], "fr"), "Emmy Noether");
});
test("all spellings and languages find one entry, with Unicode folding and stable homonyms", () => {
  for (const q of ["Euclides", "EUCLIDE", "euclid"]) assert.equal(rankMathematicians(people, q, "fr")[0].id, 1);
  assert.deepEqual(rankMathematicians(people, "elie", "fr").map(p => p.id), [2, 5]);
  assert.equal(rankMathematicians(people, "Amalie", "en")[0].id, 3);
  assert.equal(rankMathematicians(people, "d’Alembert", "fr")[0].id, 4);
  assert.equal(normalizeMathematicianName("ÉLIE—CARTAN"), "elie cartan");
  assert.equal(normalizeMathematicianName("Noe\u0308ther"), "noether");
  assert.equal(rankMathematicians(people, "Sophie Noether", "fr", true)[0].id, 3);
  assert.deepEqual(rankMathematicians(people, "Sophie Noether", "fr"), []);
});
test("aliases are optional, bounded, one per line and deduplicated without rewriting names", () => {
  assert.deepEqual(parseMathematicianAliases("Euclides\n EUCLIDES \nEuclide\nΕὐκλείδης", "Euclide", "fr"), ["Euclides", "Εὐκλείδης"]);
  assert.deepEqual(parseMathematicianAliases("", "Euclide", "fr"), []);
  assert.deepEqual(parseMathematicianAliases("Noether, Amalie Emmy", "Emmy Noether", "fr"), ["Noether, Amalie Emmy"]);
  assert.throws(() => parseMathematicianAliases("a".repeat(161), "Euclide", "fr"), /160 caractères/);
  assert.throws(() => parseMathematicianAliases(Array(21).fill("A").join("\n"), "Euclid", "en"), /20 other names/);
});

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../lib/actions/library-actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const version = new Date("2026-09-06T12:00:00Z");
const form = extra => { const f = new FormData(); Object.entries({ name: "Euclide d’Alexandrie", language: "fr", baseUpdatedAt: version.toISOString(), aliases: "Euclides", ...extra }).forEach(([k, v]) => f.set(k, v)); return f; };

function harness() {
  const state = { id: 1, slug: "euclid", name: "Euclid", aliases: ["Euclides"], fields: ["Geometry"], status: "PUBLISHED", updatedAt: version, createdById: 2, translations: { fr: "Euclide", en: "Euclid" } };
  let writes = 0;
  const relatedWrites = [];
  const tx = { mathematician: { update: async ({ where, data }) => {
    assert.equal(where.updatedAt.getTime(), state.updatedAt.getTime());
    writes++;
    for (const key of ["name", "aliases", "fields", "portraitCrop", "portraitDetails"]) if (data[key] !== undefined) state[key] = data[key];
    assert.equal(data.slug, undefined);
    const upsert = data.translations.upsert;
    state.translations[upsert.where.mathematicianId_language.language] = upsert.update.displayName;
  } }, mathematicianTranslation: { findUniqueOrThrow: async ({ where }) => ({ id: where.mathematicianId_language.language === "fr" ? 11 : 12 }) } };
  const redirects = [];
  const modules = {
    "@prisma/client": require("@prisma/client"),
    "@/lib/auth": { requireAdmin: async () => ({ id: 2 }) },
    "@/lib/db": { prisma: { mathematician: { findUnique: async () => state }, $transaction: async fn => fn(tx) } },
    "@/lib/permissions": { canEditLibraryDraft: () => true, canCreateLibraryEntry: () => true },
    "@/lib/rate-limit": { assertRateLimit: async () => {} },
    "@/lib/content-limits": limits,
    "@/lib/mathematician-names": names,
    "@/lib/portrait": portraits,
    "@/lib/mathematician-related": related,
    "@/lib/mathematician-related-db": { syncMathematicianRelated: async (transaction, translationId, rows) => { assert.equal(transaction, tx); relatedWrites.push({ translationId, rows }); } },
    "@/lib/markdown": { renderMarkdown: async text => text },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: path => redirects.push(path), unstable_rethrow: () => {} }
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => modules[name] ?? {}, Error, Date, FormData });
  return { state, actions: exports, redirects, relatedWrites, writes: () => writes };
}

test("saving related items uses the edited translation inside the parent transaction", async () => {
  const h = harness();
  const row = { key: "source", category: "SOURCE" };
  for (const language of ["fr", "en"]) {
    await h.actions.updateMathematicianAction(1, form({ language, relatedItems: JSON.stringify([row]), "related-source-label": `Reference ${language}`, "related-source-note": "$u=v$" }));
  }
  assert.deepEqual(h.relatedWrites.map(w => w.translationId), [11, 12]);
  assert.deepEqual(h.relatedWrites.map(w => w.rows[0].labelMarkdown), ["Reference fr", "Reference en"]);
  assert.equal(h.redirects.at(-1), "/library/mathematicians/euclid?lang=en");
  await h.actions.updateMathematicianAction(1, form({}));
  assert.equal(h.relatedWrites.length, 2);
});
test("editing a French name preserves English, legacy fallback, domains and the URL", async () => {
  const h = harness();
  await h.actions.updateMathematicianAction(1, form({}));
  assert.equal(h.state.translations.fr, "Euclide d’Alexandrie");
  assert.equal(h.state.translations.en, "Euclid");
  assert.equal(h.state.name, "Euclid");
  assert.equal(h.state.slug, "euclid");
  assert.deepEqual(h.state.fields, ["Geometry"]);
  assert.deepEqual(h.redirects, ["/library/mathematicians/euclid?lang=fr"]);
});
test("old forms cannot accidentally erase aliases; stale edits are refused", async () => {
  const h = harness(); const legacy = form({ canonicalName: "Euclid", displayName: "Euclide" });
  legacy.delete("name"); legacy.delete("aliases");
  await h.actions.updateMathematicianAction(1, legacy);
  assert.deepEqual(h.state.aliases, ["Euclides"]);
  await assert.rejects(h.actions.updateMathematicianAction(1, form({ baseUpdatedAt: "2026-09-01T00:00:00Z" })), /changed after/);
  assert.equal(h.writes(), 1);
});
test("invalid aliases return a correctable error without any write", async () => {
  const h = harness();
  const result = await h.actions.saveMathematicianFormAction(1, { error: "" }, form({ aliases: "a".repeat(161) }));
  assert.match(result.error, /160 caractères/);
  assert.equal(h.writes(), 0);
});

test("portrait framing and unified details persist; invalid framing cannot write", async () => {
  const h = harness();
  const crop = { x: 30, y: 70, zoom: 1.5 };
  await h.actions.updateMathematicianAction(1, form({ portraitCrop: JSON.stringify(crop), portraitDetails: "Collection — https://example.org/portrait\nCC BY 4.0" }));
  assert.deepEqual(h.state.portraitCrop, crop);
  assert.match(h.state.portraitDetails, /CC BY 4.0/);
  await h.actions.updateMathematicianAction(1, form({}));
  assert.deepEqual(h.state.portraitCrop, crop);
  const before = h.writes();
  await assert.rejects(h.actions.updateMathematicianAction(1, form({ portraitCrop: '{"x":0,"y":0,"zoom":9}' })), /Invalid portrait/);
  assert.equal(h.writes(), before);
});

test("suggestions enforce access, visibility, exclusion and a bounded private response", async () => {
  const code = ts.transpileModule(readFileSync(new URL("../app/api/library/mathematicians/suggest/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  let user = null;
  const searches = [];
  const visible = { OR: [{ status: "PUBLISHED" }, { createdById: 2, status: "DRAFT" }] };
  const modules = {
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/permissions": { canUseAdminTools: u => u.role === "ADMIN" },
    "@/lib/rate-limit": { assertRateLimit: async () => {} },
    "@/lib/mathematician-names": names,
    "@/lib/library-queries": { visibleLibraryEntryWhere: () => visible, searchMathematicians: async (...args) => {
      searches.push(args);
      return Array.from({ length: 8 }, (_, id) => ({ ...people[0], id, slug: `person-${id}`, lifespan: "Dates", portraitUrl: null, privateMetadata: "private" }));
    } }
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => modules[name], Request, Response, URL });
  const request = new Request("https://example.test/api/library/mathematicians/suggest?q=Euclid&lang=fr&exclude=3");
  assert.equal((await exports.GET(request)).status, 403);
  user = { id: 2, role: "MEMBER" };
  assert.equal((await exports.GET(request)).status, 403);
  assert.equal(searches.length, 0);
  user.role = "ADMIN";
  await exports.GET(new Request("https://example.test/?q=!!!"));
  assert.equal(searches.length, 0);
  const response = await exports.GET(request);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(searches[0][2].AND[0], visible);
  assert.equal(searches[0][2].AND[1].id.not, 3);
  const result = (await response.json()).mathematicians;
  assert.equal(result.length, 5);
  assert.equal(result[0].name, "Euclide");
  assert.equal(result[0].privateMetadata, undefined);
});
