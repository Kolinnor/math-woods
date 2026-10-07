import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as filters from '../lib/client-error-filter.ts';
import * as oauthUtils from '../lib/oauth-utils.ts';
import { fr } from '../lib/i18n/dictionaries/fr.ts';
import { en } from '../lib/i18n/dictionaries/en.ts';

const require = createRequire(import.meta.url);
function load(file, modules, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { exports, Date, URL, console: { error() {} }, ...globals,
    require: name => {
      if (name in modules) return modules[name];
      if (['@prisma/client', 'node:crypto', 'react/jsx-runtime'].includes(name)) return require(name);
      throw new Error('Unmocked module: ' + name);
    }
  });
  return exports;
}
const crawler = 'Mozilla/5.0 Chrome/145 Safari/537.36 (compatible; meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))';

test('only explicit anonymous Meta crawler identities are classified as crawler reports', () => {
  for (const userAgent of [crawler, 'facebookexternalhit/1.1', 'Facebot', 'meta-externalfetcher/1.1']) {
    assert.equal(filters.isMetaCrawlerErrorReport({ userAgent }), true);
    assert.equal(filters.isMetaCrawlerErrorReport({ userAgent, userId: 7 }), false);
  }
  for (const userAgent of [null, '', 'Mozilla/5.0 Chrome/145 Safari/537.36', 'UnknownBot/1', 'not-meta-externalagent/1', 'https://example.com/meta-externalagent/1']) {
    assert.equal(filters.isMetaCrawlerErrorReport({ userAgent }), false);
  }
});

test('crawler errors remain stored, ordinary and signed-in errors still notify, rate limits still apply', async () => {
  for (const scenario of [
    { ua: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Brave', user: {id: 8}, notifications: 0, source: 'window.error', message: "ReferenceError: Can't find variable: __firefox__", stack: 'global code@https://mathwoods.org/problems:1:12' },
    { ua: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Brave', user: {id: 8}, notifications: 1, source: 'window.error', message: "ReferenceError: Can't find variable: __firefox__", stack: 'at https://mathwoods.org/_next/static/chunks/app.js:1:12' },
    { ua: crawler, user: null, notifications: 0 },
    { ua: crawler, user: null, notifications: 0, message: 'network error' },
    { ua: crawler, user: null, notifications: 1, message: 'An error occurred in the Server Components render.' },
    { ua: 'Mozilla/5.0', user: null, notifications: 1 },
    { ua: 'UnknownBot/1', user: null, notifications: 1 },
    { ua: crawler, user: { id: 8 }, notifications: 1 },
    { ua: crawler, user: null, notifications: 0, limited: true }
  ]) {
    const stored = [], sent = [];
    let ownerQueries = 0;
    const route = load('app/api/error-reports/route.ts', {
      'next/headers': { headers: async () => new Headers({ 'user-agent': scenario.ua }) },
      'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
      '@/lib/auth': { getCurrentUser: async () => scenario.user },
      '@/lib/client-error-filter': filters,
      '@/lib/db': { prisma: {
        errorReport: { create: async ({ data }) => { stored.push(data); return { id: 123 }; } },
        user: { findMany: async () => { ownerQueries++; return [{ id: 1 }]; } }
      } },
      '@/lib/notifications': { createNotification: async input => { sent.push(input); } },
      '@/lib/rate-limit': { assertRateLimit: async () => { if (scenario.limited) throw new Error('limited'); } },
      '@/lib/security': { sanitizeReportPath: path => path }
    });
    const response = await route.POST(new Request('https://mathwoods.invalid/api/error-reports', {
      method: 'POST', body: JSON.stringify({ message: scenario.message ?? 'Loading chunk 7395 failed.', path: '/login', source: scenario.source ?? 'next.global-error-boundary', stack: scenario.stack })
    }));
    assert.equal(response.status, scenario.limited ? 429 : 200);
    assert.equal(stored.length, scenario.limited ? 0 : 1);
    if (!scenario.limited) {
      assert.equal(stored[0].userAgent, scenario.ua);
      assert.equal(stored[0].message, scenario.message ?? 'Loading chunk 7395 failed.');
    }
    assert.equal(sent.length, scenario.notifications);
    assert.equal(ownerQueries, scenario.notifications);
  }
});

function oauthModule(token) {
  return load('lib/oauth.ts', {
    'next/headers': { cookies: async () => ({ get: () => token ? { value: token } : undefined }) },
    'openid-client': {},
    '@/lib/auth': { createSession: () => { throw new Error('Must not authenticate'); } },
    '@/lib/db': { prisma: { oAuthAttempt: { findFirst: async ({ where }) => {
      assert.ok(where.expiresAt.gt instanceof Date);
      assert.equal(where.provider, 'GOOGLE');
      return null;
    } } } },
    '@/lib/oauth-utils': oauthUtils
  }, { process: { env: { GOOGLE_OAUTH_CLIENT_ID: 'test-id', GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret' } } });
}

test('missing and expired OAuth attempts have a specific error and never authenticate', async () => {
  for (const token of [null, 'expired-token']) {
    const oauth = oauthModule(token);
    await assert.rejects(oauth.finishOAuthCallback('google', new URL('https://mathwoods.invalid/api/auth/google/callback')),
      error => error instanceof oauth.OAuthAttemptExpiredError);
  }
});

test('callback distinguishes expiration, deactivation and other failures, preserving successful redirects', async () => {
  const oauth = oauthModule(null);
  for (const [error, expected] of [
    [new oauth.OAuthAttemptExpiredError(), '/login?oauthError=expired'],
    [new oauth.OAuthAccountDeactivatedError(), '/login?oauthError=deactivated'],
    [new Error('Invalid OAuth state'), '/login?oauthError=failed'],
    [null, '/problems']
  ]) {
    let cleared = 0;
    const route = load('app/api/auth/[provider]/callback/route.ts', {
      'next/server': { NextResponse: { redirect: url => Response.redirect(url, 307) } },
      '@/lib/oauth': { ...oauth, parseOAuthProvider: oauthUtils.parseOAuthProvider,
        finishOAuthCallback: async () => { if (error) throw error; return '/problems'; },
        clearOAuthCookie: async () => { cleared++; },
        oauthAppUrl: path => new URL(path, 'https://mathwoods.invalid') }
    });
    const response = await route.GET({ nextUrl: new URL('https://mathwoods.invalid/api/auth/google/callback') }, { params: Promise.resolve({ provider: 'google' }) });
    assert.equal(response.headers.get('location'), 'https://mathwoods.invalid' + expected);
    assert.equal(cleared, error ? 1 : 0);
  }
});

test('login renders the localized expiration guidance and keeps provider restart links', async () => {
  for (const dictionary of [fr, en]) {
    const page = load('app/login/page.tsx', {
      'next/link': { default: 'a' }, '@/components/ForestPageLayout': { ForestPageLayout: 'main' },
      '@/components/OAuthProviderIcon': { OAuthProviderIcon: 'i' }, '@/lib/actions/auth-actions': {},
      '@/lib/i18n/server': { getTranslations: async () => dictionary },
      '@/lib/math-levels': { MATH_LEVEL_OPTIONS: [] }, '@/lib/user-display': { DISPLAY_NAME_MAX_LENGTH: 80 },
      '@/lib/oauth': { safeReturnTo: oauthUtils.safeReturnTo, configuredOAuthProviders: () => [{ key: 'google', label: 'Google' }] }
    }).default;
    const tree = JSON.stringify(await page({ searchParams: Promise.resolve({ oauthError: 'expired' }) }));
    assert.ok(tree.includes(dictionary.auth.errors.oauthExpired));
    assert.ok(tree.includes('/api/auth/google/start?returnTo=%2F'));
    assert.ok(!tree.includes(dictionary.auth.errors.oauthFailed));
  }
});


test('injected browser signatures are narrow and never hide application or server errors', () => {
  const base = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7_8 like Mac OS X) AppleWebKit/605.1.15 Brave', source: 'window.error', stack: 'global code@https://mathwoods.org/problems:1:19\n    at browser error event (https://mathwoods.org/problems:1:19)' };
  for (const message of [
    "ReferenceError: Can't find variable: __firefox__",
    "ReferenceError: Can't find variable: DarkReader",
    "TypeError: undefined is not an object (evaluating 'window.__firefox__.reader')",
    "TypeError: undefined is not an object (evaluating 'window.__firefox__.refresh_youtube_quality_0DD88D11A0414F209C3D07230C65BA5A')",
    "TypeError: undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')"
  ]) {
    const input = {...base, message};
    assert.equal(filters.isKnownInjectedBrowserScriptError(input), true);
    for (const override of [{userAgent:'Firefox'}, {source:'next.error-boundary'}, {stack:null}, {stack:'global code@https://mathwoods.org/_next/static/chunks/app.js:1:19'}, {message:'TypeError: page failed'}, {message: message + ' unrelated failure'}]) {
      assert.equal(filters.isKnownInjectedBrowserScriptError({...input, ...override}), false);
    }
  }
});
