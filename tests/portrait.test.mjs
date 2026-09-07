import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePortraitCrop, submittedPortraitCrop, portraitDetails } from '../lib/portrait.ts';
test('framing rejects invalid numbers and leaves old forms unchanged', () => {
  for (const value of [null, {}, {x:NaN,y:50,zoom:1}, {x:50,y:Infinity,zoom:1}, {x:50,y:50,zoom:0}, {x:101,y:50,zoom:1}, {x:'50',y:50,zoom:1}]) assert.throws(()=>parsePortraitCrop(value));
  assert.equal(submittedPortraitCrop(new FormData()),undefined);
});
test('unified details retain legacy attribution and allow an intentional empty value', () => {
  assert.equal(portraitDetails({imageCredit:'Museum',imageCreditUrl:'https://example.org',imageLicense:'CC BY'}),'Museum\nhttps://example.org\nCC BY');
  assert.equal(portraitDetails({portraitDetails:'',imageCredit:'Museum'}),'');
});
