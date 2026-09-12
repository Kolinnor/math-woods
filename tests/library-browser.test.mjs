import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryCatalogueHref, libraryReturnHref } from '../lib/library-browser.ts';

test('a catalogue return link retains search, language, sort and page across entry languages', () => {
  const catalogue = '/library/references';
  const href = libraryCatalogueHref(catalogue, { q: 'Éléments & algèbre', type: 'BOOK', language: 'fr', sort: 'updated', page: '3' });
  const returned = libraryReturnHref(href, catalogue);
  assert.equal(returned.split('?')[0], catalogue);
  assert.deepEqual(Object.fromEntries(new URL(returned, 'https://example.com').searchParams), Object.fromEntries(new URL(href, 'https://example.com').searchParams));
  const navigation = new URL('/library/references/elements?lang=en&returnTo=' + encodeURIComponent(href), 'https://example.com');
  assert.equal(libraryReturnHref(navigation.searchParams.get('returnTo'), catalogue), returned);
});

test('return links reject external destinations, sibling routes and path traversal', () => {
  const catalogue = '/library/history';
  for (const href of [undefined, 'https://evil.example', '//evil.example', '/library/references?q=x', '/library/history/../references?q=x', '/library/history%2f..%2freferences?q=x', '/library/history\\..\\references?q=x']) {
    assert.equal(libraryReturnHref(href, catalogue), catalogue, String(href));
  }
  assert.equal(libraryReturnHref(catalogue + '?q=test&returnTo=https://evil.example&unknown=x#fragment', catalogue), catalogue + '?q=test');
});

test('catalogue links encode multilingual text and preserve repeated language filters', () => {
  const href = libraryCatalogueHref('/library/mathematicians', { q: 'é & #?', languagesSet: '1', language: ['fr', 'en'], page: undefined });
  const url = new URL(href, 'https://example.com');
  assert.equal(url.searchParams.get('q'), 'é & #?');
  assert.deepEqual(url.searchParams.getAll('language'), ['fr', 'en']);
  assert.equal(url.searchParams.has('page'), false);
});
