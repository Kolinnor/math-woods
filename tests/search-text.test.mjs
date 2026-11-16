import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { Prisma, PrismaClient } from "@prisma/client";
import * as text from "../lib/search-text.ts";
import * as reference from "../lib/reference-search.ts";
import { normalizeSearchText, searchMatchScore } from "../lib/search-ranking.ts";
import { normalizeConceptMapSearch } from "../lib/concept-map-text.ts";
const require = createRequire(import.meta.url);
const pairs = [["nœud", "noeud"], ["NŒUDS", "noeuds"], ["Cœur", "coeur"], ["Æther", "aether"], ["Éléments", "elements"], ["E\u0301le\u0301ments", "elements"]];

test("all search normalizers recognize keyboard spellings without modifying source text", () => {
  for (const [original, plain] of pairs) {
    for (const normalize of [text.foldSearchText, normalizeSearchText, normalizeConceptMapSearch]) {
      assert.equal(normalize(original), normalize(plain));
    }
    assert.deepEqual(reference.referenceSearchWords(original), reference.referenceSearchWords(plain));
    assert.equal(searchMatchScore({title:original,slug:"legacy-url"}, plain), 0);
  }
});

function load(client) {
  const exports = {};
  const code = ts.transpileModule(readFileSync("lib/search-text-db.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const modules = {"@prisma/client": {Prisma}, "@/lib/db": {prisma:client}, "./reference-search.ts":reference, "./search-text.ts":text};
  new Function("require","exports",code)(name => modules[name] ?? require(name),exports);
  return exports;
}

test("database search folds stored fields, binds values and skips empty queries", async () => {
  let calls = 0;
  const db = load({$queryRaw: async sql => {
    calls++;
    assert.ok(sql.text.includes('normalize('));
    assert.ok(sql.text.includes('"Concept"'));
    assert.ok(!sql.text.includes("danger' OR"));
    assert.ok(sql.values.includes("danger or 1 1"));
    return [{id:7}];
  }});
  assert.deepEqual(await db.matchingSearchTextIds("concept", ["danger' OR 1=1 --"]), [7]);
  assert.deepEqual(await db.matchingSearchTextIds("concept", ["", "% _"]), []);
  assert.equal(calls, 1);
});

test("PostgreSQL uses the same equivalences, including exact and partial searches", {skip: !process.env.MW_SEARCH_POSTGRES_TEST}, async () => {
  const client = new PrismaClient();
  try {
    for (const [original, plain] of pairs) {
      const rows = await client.$queryRaw(Prisma.sql`SELECT
        trim(${reference.foldedSql(Prisma.sql`${original}::text`)}) = ${text.searchPhrase(plain)} AS exact,
        strpos(${reference.foldedSql(Prisma.sql`${original}::text`)}, ${text.searchPhrase(plain).slice(0, 3)}) > 0 AS partial`);
      assert.equal(rows[0].exact, true); assert.equal(rows[0].partial, true);
    }
    const search = load(client);
    for (const kind of ["concept", "problem", "alias", "quote", "exploration"]) {
      const original = await search.matchingSearchTextIds(kind, ["nœud"]);
      const plain = await search.matchingSearchTextIds(kind, ["noeud"]);
      assert.deepEqual(original.sort(), plain.sort());
    }
  } finally { await client.$disconnect(); }
});
