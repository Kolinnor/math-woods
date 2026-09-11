import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import ts from 'typescript';
import { isSitePresenceId } from '../lib/site-presence-config.ts';
import { clientErrorDetails, clientErrorEventStack } from '../lib/client-error-diagnostics.ts';

const compiled = ts.transpileModule(readFileSync(new URL('../lib/browser-uuid.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2018 }
}).outputText;
function uuid(crypto) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, crypto });
  return exports.browserUUID;
}
test('native and older browsers produce valid independent UUID v4 identifiers', () => {
  for (const crypto of [webcrypto, { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }]) {
    const make = uuid(crypto), ids = new Set();
    for (let i = 0; i < 1000; i++) { const id = make(); assert.ok(isSitePresenceId(id)); ids.add(id); }
    assert.equal(ids.size, 1000);
  }
  assert.throws(uuid(undefined)); // callers must not silently substitute weak randomness
});
test('diagnostics preserve cross-window errors and their anonymous Safari frames', () => {
  const error = vm.runInNewContext('new RangeError("Maximum call stack size exceeded")');
  assert.equal(error instanceof Error, false);
  assert.match(clientErrorDetails(error).stack, /RangeError/);
  assert.equal(clientErrorDetails(error).message, error.message);
  assert.equal(clientErrorDetails(undefined).message, 'undefined');
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(typeof clientErrorDetails(cyclic).message, 'string');
  const stack = clientErrorEventStack('@\nPk@\nNk@', 'https://mathwoods.org/concepts?token=secret#private', 415, 45);
  assert.match(stack, /Pk@\nNk@/);
  assert.match(stack, /https:\/\/mathwoods.org\/concepts:415:45/);
  assert.doesNotMatch(stack, /secret|private/);
  assert.equal(clientErrorEventStack(null, '', 0, 0), null);
  assert.equal(clientErrorEventStack('original', 'data:text/plain,private', 0, 0), 'original');
});
