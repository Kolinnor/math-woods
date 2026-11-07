import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import * as permissions from "../lib/permissions.ts";
import * as limits from "../lib/content-limits.ts";
import { requireReadableReferenceTitle } from "../lib/reference-title.ts";
import * as referenceAuthors from "../lib/reference-authors.ts";
import { validateReferenceAuthors } from "../lib/reference-authors-db.ts";

test("only admins and owners can correct pending references; other entry permissions stay intact", () => {
  for (const role of ["USER", "MODERATOR", "ADMIN", "OWNER"]) {
    for (const createdById of [1, 2]) {
      const user = { id: 2, role, emailVerifiedAt: new Date() };
      const pending = { createdById, status: "PENDING_REVIEW" };
      assert.equal(permissions.canEditLibraryReference(user, pending), ["ADMIN", "OWNER"].includes(role));
      assert.equal(permissions.canEditLibraryDraft(user, pending), ["ADMIN", "OWNER"].includes(role));
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
  const entry = { id: 1, slug: "elements", canonicalTitle: "Elements", createdById: 1, status, updatedAt: version, submittedAt: version, publishedAt: version, translations: [{ language: "fr", descriptionMarkdown: "" }, { language: "en", descriptionMarkdown: "English presentation" }] };
  const writes = [];
  const redirects = [];
  const unexpected = () => { throw new Error("Unexpected notification or publication"); };
  const modules = {
    "@prisma/client": require("@prisma/client"),
    "@/lib/auth": { requireAdmin: async () => ({ id: 2, role: "ADMIN" }) },
    "@/lib/permissions": permissions,
    "@/lib/content-limits": limits,
    "@/lib/reference-title": { requireReadableReferenceTitle },
    "@/lib/reference-authors": referenceAuthors,
    "@/lib/reference-authors-db": { validateReferenceAuthors },
    "@/lib/reference-editions": { readReferenceBibliography: () => ({}), validateReferenceWork: async () => null },
    "@/lib/library": { normalizeReferenceDedupeKey: () => "key" },
    "@/lib/markdown": { renderMarkdown: async text => text },
    "@/lib/notifications": { createNotification: unexpected },
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: url => redirects.push(url) },
    "@/lib/db": { prisma: {
      libraryReference: { findUnique: async () => entry, findFirst: async () => null },
      user: { findMany: unexpected },
      $transaction: async callback => callback({ mathematician: { findMany: async () => [{ id: 12 }] }, libraryReferenceAuthor: { findMany: async () => [] }, libraryReference: { update: async ({ where, data }) => {
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

test("corrections keep publication and archives, reset review and preserve URLs and publication dates", async () => {
  for (const status of ["PENDING_REVIEW", "PUBLISHED", "ARCHIVED"]) {
    // Legacy submit/draft buttons must not hide an already submitted entry.
    for (const intent of ["save", "submit", "draft"]) {
      const h = harness(status);
      await h.action(1, form(intent));
      assert.equal(h.writes.length, 1);
      const data = h.writes[0];
      assert.equal(data.status, status === "PENDING_REVIEW" ? "PUBLISHED" : status);
      assert.equal(data.submittedAt, h.entry.submittedAt);
      for (const key of ["reviewedById", "reviewedAt"]) assert.equal(data[key], null);
      for (const key of ["reviewNote", "slug"]) assert.equal(data[key], undefined);
      assert.equal(data.publishedAt, status === "ARCHIVED" ? undefined : version);
      assert.equal(data.translations.upsert.update.displayTitle, "Éléments");
      assert.deepEqual(JSON.parse(JSON.stringify(data.contributions)), { upsert: { where: { referenceId_userId: { referenceId: 1, userId: 2 } }, create: { userId: 2, edited: true }, update: { edited: true } } });
      assert.deepEqual(h.redirects, ["/library/references/elements?lang=fr"]);
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

test("editing replaces author links and citation names in the same guarded write, including removal", async () => {
  const h = harness("PUBLISHED");
  const data = form("save");
  const authors = [{ name: "Henri Poincaré", mathematicianId: 12 }, { name: "Paul Appell", mathematicianId: null }];
  data.set("authorEntries", JSON.stringify(authors));
  await h.action(1, data);
  assert.equal(h.writes[0].authors, "Henri Poincaré\nPaul Appell");
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].authorEntries)), { deleteMany: {}, create: authors.map((row, position) => ({ ...row, position })) });
  data.set("authorEntries", "[]");
  await h.action(1, data);
  assert.equal(h.writes[1].authors, null);
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[1].authorEntries)), { deleteMany: {}, create: [] });
});


test("presentation revisions record the exact before/after text and editor, scoped to the edited language", async () => {
  const h = harness("PUBLISHED");
  h.entry.translations[0].descriptionMarkdown = "Ancienne présentation";
  const data = form("save");
  data.set("descriptionMarkdown", "Nouvelle présentation");
  await h.action(1, data);
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes[0].presentationRevisions)), {
    create: { language: "fr", markdown: "Nouvelle présentation", previousMarkdown: "Ancienne présentation", editedById: 2 }
  });
  data.set("language", "en");
  data.set("descriptionMarkdown", "Updated English presentation");
  await h.action(1, data);
  assert.equal(h.writes[1].presentationRevisions.create.previousMarkdown, "English presentation");
  assert.equal(h.writes[1].presentationRevisions.create.language, "en");
});

test("bibliography-only edits do not add history; clearing a presentation and adding a translation do", async () => {
  const h = harness("PUBLISHED");
  const data = form("save");
  await h.action(1, data);
  assert.equal(h.writes[0].presentationRevisions, undefined);
  h.entry.translations[0].descriptionMarkdown = "À supprimer";
  await h.action(1, data);
  assert.equal(h.writes[1].presentationRevisions.create.markdown, "");
  assert.equal(h.writes[1].presentationRevisions.create.previousMarkdown, "À supprimer");
  h.entry.translations = [];
  await h.action(1, data);
  assert.equal(h.writes[2].presentationRevisions.create.previousMarkdown, null);
});

test("a stale presentation edit cannot create a revision without saving its content", async () => {
  const h = harness("PUBLISHED", true);
  const data = form("save");
  data.set("descriptionMarkdown", "Concurrent edit");
  await assert.rejects(h.action(1, data), /Concurrent update/);
  assert.equal(h.writes.length, 0);
});


test("the single title field corrects the original title without replacing other translations", async () => {
  const h = harness("PUBLISHED");
  h.entry.canonicalTitle = "Élements";
  h.entry.translations = [{ language: "fr", displayTitle: "Élements", descriptionMarkdown: "" }, { language: "en", displayTitle: "Elements", descriptionMarkdown: "" }];
  const data = form("save"); data.delete("canonicalTitle"); data.set("title", "Éléments");
  await h.action(1, data);
  assert.equal(h.writes[0].canonicalTitle, "Éléments");
  assert.equal(h.writes[0].translations.upsert.update.displayTitle, "Éléments");
  assert.equal(h.writes[0].translations.upsert.where.referenceId_language.language, "fr");
  assert.equal(h.writes[0].presentationRevisions, undefined);
});

test("the single localized title preserves the bibliographic title, including new translations", async () => {
  const h = harness("PUBLISHED");
  h.entry.canonicalTitle = "La Science et l’Hypothèse";
  h.entry.translations = [{ language: "fr", displayTitle: h.entry.canonicalTitle, descriptionMarkdown: "" }, { language: "en", displayTitle: "Science and Hypothesis", descriptionMarkdown: "" }];
  const data = form("save"); data.delete("canonicalTitle"); data.set("language", "en"); data.set("title", "Science and Hypothesis, corrected");
  await h.action(1, data);
  assert.equal(h.writes[0].canonicalTitle, h.entry.canonicalTitle);
  assert.equal(h.writes[0].translations.upsert.update.displayTitle, "Science and Hypothesis, corrected");
  h.entry.translations.pop();
  await h.action(1, data);
  assert.equal(h.writes[1].canonicalTitle, h.entry.canonicalTitle);
  assert.equal(h.writes[1].translations.upsert.create.displayTitle, "Science and Hypothesis, corrected");
});

test("a legacy custom title remains editable and malformed original titles can still be repaired", async () => {
  const h = harness("PUBLISHED");
  h.entry.translations = [{ language: "fr", displayTitle: "Titre personnalisé", descriptionMarkdown: "" }];
  const data = form("save"); data.delete("canonicalTitle"); data.set("title", "Titre personnalisé corrigé");
  await h.action(1, data);
  assert.equal(h.writes[0].canonicalTitle, "Elements");
  assert.equal(h.writes[0].translations.upsert.update.displayTitle, "Titre personnalisé corrigé");
  h.entry.canonicalTitle = "@book{broken,";
  await h.action(1, data);
  assert.equal(h.writes[1].canonicalTitle, "Titre personnalisé corrigé");
});
