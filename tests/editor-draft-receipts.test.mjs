import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as receipts from "../lib/editor-draft-receipts.ts";

const key = "math-woods-markdown-draft:concept:42:body";
const summaryKey = "math-woods-text-field-draft:concept:42:edit-summary";
const compile = file => ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const client = compile("../lib/editor-draft-receipts.ts");
function browser() {
  const stored = new Map();
  const inputs = [];
  const form = { querySelectorAll: () => inputs.slice(), appendChild: input => inputs.push(input) };
  const document = { cookie: "", createElement: () => {
    const input = { dataset: {}, remove: () => inputs.splice(inputs.indexOf(input), 1) }; return input;
  } };
  const exports = {};
  let sequence = 0;
  const localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  vm.runInNewContext(client, { exports, localStorage, document, crypto: { randomUUID: () => `token-${++sequence}` } });
  const save = (key, value, extra = {}) => stored.set(key, JSON.stringify({ value, updatedAt: 1000, baseValue: "Old server content", ...extra }));
  const acknowledge = entries => { document.cookie = `mw-editor-saved=${encodeURIComponent(JSON.stringify(entries))}`; exports.clearAcknowledgedEditorDrafts(); };
  return { ...exports, stored, inputs, form, save, acknowledge };
}

test("a failed submission emits no receipt and preserves body and summary; retry replaces attempt tokens", () => {
  const b = browser();
  b.save(key, "$u$ corrected"); b.save(summaryKey, "Use LaTeX");
  for (const k of [key, summaryKey]) b.markEditorDraftSubmission(b.form, k, JSON.parse(b.stored.get(k)).value);
  b.clearAcknowledgedEditorDrafts();
  assert.equal(JSON.parse(b.stored.get(key)).value, "$u$ corrected");
  assert.equal(JSON.parse(b.stored.get(summaryKey)).value, "Use LaTeX");
  const first = JSON.parse(b.inputs[0].value);
  b.markEditorDraftSubmission(b.form, key, "$u$ corrected");
  assert.equal(b.inputs.length, 2);
  b.acknowledge([first]);
  assert.ok(b.stored.has(key));
});

test("success clears only submitted versions and never subsequent edits or other pages", () => {
  const b = browser();
  b.save(key, "submitted"); b.save(summaryKey, "summary");
  b.markEditorDraftSubmission(b.form, key, "submitted"); b.markEditorDraftSubmission(b.form, summaryKey, "summary");
  const ack = b.inputs.map(input => JSON.parse(input.value));
  b.save(key, "newer edits");
  const other = "math-woods-markdown-draft:problem:99:statement"; b.save(other, "other page");
  b.acknowledge(ack);
  assert.equal(JSON.parse(b.stored.get(key)).value, "newer edits");
  assert.equal(b.stored.has(summaryKey), false);
  assert.ok(b.stored.has(other));
  b.markEditorDraftSubmission(b.form, key, "newer edits");
  b.acknowledge(b.inputs.map(input => JSON.parse(input.value)));
  assert.equal(b.stored.has(key), false);
});

test("invalid receipts cannot clear arbitrary local data and unavailable storage does not throw", () => {
  const b = browser(); b.save("session", "private");
  b.acknowledge([{ key: "session", token: "token-1" }]); assert.ok(b.stored.has("session"));
  const exports = {};
  vm.runInNewContext(client, { exports, document: { get cookie() { throw Error("blocked"); } } });
  assert.doesNotThrow(() => exports.clearAcknowledgedEditorDrafts());
  assert.doesNotThrow(() => exports.markEditorDraftSubmission({}, key, "value"));
});

test("server confirmation contains only validated identifiers, including when citations are absent", async () => {
  const writes = [];
  const exports = {};
  vm.runInNewContext(compile("../lib/citation-draft-receipt.ts"), { exports, require: name => name === "next/headers"
    ? { cookies: async () => ({ set: (...args) => writes.push(args) }) } : receipts });
  const data = new FormData();
  data.append("editorDraftReceipt", JSON.stringify({ key, token: "confirmed", content: "Never in cookie" }));
  data.append("editorDraftReceipt", "invalid");
  await exports.acknowledgeCitationDraft(data);
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], "mw-editor-saved");
  assert.deepEqual(JSON.parse(writes[0][1]), [{ key, token: "confirmed" }]);
  assert.equal(writes[0][2].sameSite, "lax");
});
