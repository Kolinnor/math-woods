import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as permissions from "../lib/permissions.ts";
import * as limits from "../lib/content-limits.ts";
import { requireReadableReferenceTitle } from "../lib/reference-title.ts";

test("only admins and owners can correct pending references; other entry permissions stay intact", () => {
  for (const role of ["USER", "MODERATOR", "ADMIN", "OWNER"]) {
    for (const createdById of [1, 2]) {
      const user = { id: 2, role, emailVerifiedAt: new Date() };
      const pending = { createdById, status: "PENDING_REVIEW" };
      assert.equal(permissions.canEditLibraryReference(user, pending), ["ADMIN", "OWNER"].includes(role));
      assert.equal(permissions.canEditLibraryDraft(user, pending), false);
      for (const status of ["DRAFT", "NEEDS_WORK", "PUBLISHED", "ARCHIVED"]) {
        const entry = { createdById, status };
        assert.equal(permissions.canEditLibraryReference(user, entry), permissions.canEditLibraryDraft(user, entry));
      }
    }
  }
});

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../lib/actions/library-actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const version = new Date("2026-09-06T12:00:00Z");
function harness(status, race = false) {
  const entry = { id: 1, slug: "elements", canonicalTitle: "Elements", createdById: 1, status, updatedAt: version, submittedAt: version };
  const writes = [];
  const redirects = [];
  const unexpected = () => { throw new Error("Unexpected notification or publication"); };
  const modules = {
    "@prisma/client": require("@prisma/client"),
    "@/lib/auth": { requireAdmin: async () => ({ id: 2, role: "ADMIN" }) },
    "@/lib/permissions": permissions,
    "@/lib/content-limits": limits,
    "@/lib/reference-title": { requireReadableReferenceTitle },
    "@/lib/reference-editions": { readReferenceBibliography: () => ({}), validateReferenceWork: async () => null },
    "@/lib/library": { normalizeReferenceDedupeKey: () => "key" },
    "@/lib/markdown": { renderMarkdown: async text => text },
    "@/lib/notifications": { createNotification: unexpected },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: url => redirects.push(url) },
    "@/lib/db": { prisma: {
      libraryReference: { findUnique: async () => entry, findFirst: async () => null },
      user: { findMany: unexpected },
      $transaction: async callback => callback({ libraryReference: { update: async ({ where, data }) => {
        assert.equal(where.id, 1);
        assert.equal(where.updatedAt.getTime(), version.getTime());
        if (race) throw new Error("Concurrent update rejected");
        writes.push(data);
      } } })
    } }
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => modules[name] ?? {}, FormData, Date, Error });
  return { action: exports.updateLibraryReferenceAction, entry, writes, redirects };
}
const form = (intent, timestamp = version.toISOString()) => {
  const data = new FormData();
  Object.entries({ canonicalTitle: "Éléments", referenceType: "BOOK", language: "fr", intent, baseUpdatedAt: timestamp }).forEach(([k, v]) => data.set(k, v));
  return data;
};

test("corrections preserve pending, published and archived states, review metadata and URLs", async () => {
  for (const status of ["PENDING_REVIEW", "PUBLISHED", "ARCHIVED"]) {
    // Legacy submit/draft buttons must not bypass the separate review workflow.
    for (const intent of ["save", "submit", "draft"]) {
      const h = harness(status);
      await h.action(1, form(intent));
      assert.equal(h.writes.length, 1);
      const data = h.writes[0];
      assert.equal(data.status, status);
      assert.equal(data.submittedAt, h.entry.submittedAt);
      for (const key of ["reviewedById", "reviewedAt", "reviewNote", "slug", "publishedAt"]) assert.equal(data[key], undefined);
      assert.equal(data.translations.upsert.update.displayTitle, "Éléments");
      assert.deepEqual(h.redirects, ["/library/references/elements"]);
    }
  }
});

test("stale reference forms and a concurrent review cannot overwrite newer changes", async () => {
  const h = harness("PENDING_REVIEW");
  await assert.rejects(h.action(1, form("save", "2026-09-05T00:00:00Z")), /changed after/);
  assert.equal(h.writes.length, 0);
  const race = harness("PENDING_REVIEW", true);
  await assert.rejects(race.action(1, form("save")), /Concurrent update/);
  assert.equal(race.writes.length, 0);
});
