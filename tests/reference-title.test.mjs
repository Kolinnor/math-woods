import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { requireReadableReferenceTitle } from "../lib/reference-title.ts";
import * as limits from "../lib/content-limits.ts";
import { parseProblemCitations } from "../lib/problem-citations.ts";

test("catalogue titles reject complete entries, isolated fields and punctuation fragments", () => {
  for (const title of ["@book{calais2014elements,", "@article ( key,", "author = {Josette Calais},", "  TITLE = \"Éléments\",", "year = 2014,", "language = {fr}", "}", " }, ", "Livre\n@book{key,", "Livre\n isbn = {9782130633471},"]) {
    assert.throws(() => requireReadableReferenceTitle(title, "fr"), /Indiquez le titre.*BibTeX/, title);
    assert.throws(() => requireReadableReferenceTitle(title, "en"), /Enter the resource title.*BibTeX/, title);
  }
  for (const title of ["Éléments", "1984", "E = mc²", "Title: an introduction", "{A, B} and their symmetries", "Cours d'algèbre", "数学", "Vidéo : nombres premiers"]) {
    assert.doesNotThrow(() => requireReadableReferenceTitle(title), title);
  }
});

test("free citations remain accepted independently of catalogue validation", () => {
  const citation = { citationKey: "free-test", text: "Original — idée personnelle", referenceId: null, role: "SOURCE" };
  assert.equal(parseProblemCitations([citation])[0].text, citation.text);
});

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../lib/actions/library-actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

// Exercise the actual server actions with isolated auth/database boundaries.
// A validation failure must happen before any write or notification.
function actionsFor(entry, update = () => { throw new Error("Unexpected database write"); }) {
  const exports = {};
  const unexpectedWrite = () => { throw new Error("Unexpected database write"); };
  const mocks = {
    "@prisma/client": require("@prisma/client"),
    "@/lib/auth": { requireAdmin: async () => ({ id: 2 }), requireVerifiedUser: async () => ({ id: 2 }) },
    "@/lib/content-limits": limits,
    "@/lib/reference-title": { requireReadableReferenceTitle },
    "@/lib/rate-limit": { assertRateLimit: async () => {} },
    "@/lib/permissions": { canCreateLibraryEntry: () => true, canEditLibraryReference: () => true, canReviewLibraryEntry: () => true },
    "@/lib/db": { prisma: { libraryReference: {
      findUnique: async () => entry, create: unexpectedWrite, update: unexpectedWrite, updateMany: update
    }, notification: { updateMany: unexpectedWrite } } }
  };
  vm.runInNewContext(compiled, { exports, require: name => mocks[name] ?? {}, FormData, Date, Error });
  return exports;
}

const form = values => { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; };
const pendingEntry = { id: 1, slug: "example", canonicalTitle: "Éléments", status: "PENDING_REVIEW", createdById: 1, updatedAt: new Date("2026-09-06T12:00:00Z"), translations: [{ displayTitle: "Éléments" }] };

test("proposal, creation and editing reject bad titles before writing", async () => {
  const actions = actionsFor(pendingEntry);
  const result = await actions.proposeLibraryReferenceAction({}, form({ title: "author = {Calais},", language: "fr" }));
  assert.equal(result.success, false);
  assert.match(result.message, /Indiquez le titre/);
  for (const titles of [{ canonicalTitle: "}" }, { canonicalTitle: "Éléments", displayTitle: "year = 2014," }]) {
    await assert.rejects(actions.createLibraryReferenceAction(form({ ...titles, language: "fr" })), /Indiquez le titre/);
    await assert.rejects(actions.updateLibraryReferenceAction(1, form({ ...titles, language: "en" })), /Enter the resource title/);
  }
});

test("publishing checks the canonical title and every translation, including old pending records", async () => {
  for (const entry of [
    { ...pendingEntry, canonicalTitle: "}" },
    { ...pendingEntry, translations: [{ displayTitle: "Éléments" }, { displayTitle: "author = {Euclid}," }] }
  ]) {
    await assert.rejects(actionsFor(entry).reviewLibraryEntryAction("reference", 1, "publish", form({ language: "fr" })), /Indiquez le titre/);
  }
});

test("publication refuses a concurrent change after title validation", async () => {
  let checked = false;
  const actions = actionsFor(pendingEntry, async ({ where }) => {
    assert.equal(where.updatedAt, pendingEntry.updatedAt);
    assert.equal(where.status, "PENDING_REVIEW");
    checked = true;
    return { count: 0 };
  });
  await assert.rejects(actions.reviewLibraryEntryAction("reference", 1, "publish", form({ language: "en" })), /Reload/);
  assert.ok(checked);
});
