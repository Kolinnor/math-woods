import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as polls from '../lib/announcement-polls.ts';
import * as limits from '../lib/content-limits.ts';

const require = createRequire(import.meta.url);
const redirectError = new Error('NEXT_REDIRECT');
function load(file, modules) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX
  } }).outputText;
  vm.runInNewContext(code, { exports, Date, require: name => {
    if (name in modules) return modules[name];
    if (name === '@prisma/client' || name === 'react/jsx-runtime') return require(name);
    if (name === '@/lib/announcement-polls') return polls;
    if (name === '@/lib/content-limits') return limits;
    if (name === 'next/cache') return { revalidatePath() {} };
    if (name === 'next/navigation') return { redirect() { throw redirectError; } };
    return {};
  } });
  return exports;
}
function data(options = 'Oui\nNon') {
  const form = new FormData();
  for (const [key, value] of Object.entries({ title: 'Announcement', bodyMarkdown: 'Message', includePoll: 'on', pollQuestion: 'Votre avis ?', pollOptions: options })) form.set(key, value);
  return form;
}
function fixture() {
  let user = { id: 4, role: 'MEMBER' }, failRate = false;
  const poll = { pollQuestion: 'Question', pollClosedAt: null, pollOptions: [{ id: 10 }, { id: 11 }] };
  const votes = new Map(), created = [], locks = [];
  const db = {
    announcement: {
      findUnique: async ({ where }) => where.id === 1 ? poll : null,
      update: async ({ data }) => Object.assign(poll, data),
      create: async ({ data }) => { created.push(data); return { id: 1 }; },
      delete: async () => {}
    },
    announcementPollVote: { upsert: async ({ where, create, update }) => {
      const key = `${where.announcementId_userId.announcementId}:${where.announcementId_userId.userId}`;
      votes.set(key, votes.has(key) ? { ...votes.get(key), ...update } : create);
    } }
  };
  // Model transaction-lock serialization; SQL uniqueness/FKs are tested separately below.
  let tail = Promise.resolve();
  db.$transaction = async callback => {
    const previous = tail; let release;
    tail = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await callback(db); } finally { release(); }
  };
  const actions = load('lib/actions/announcement-actions.ts', {
    '@/lib/db': { prisma: db },
    '@/lib/auth': {
      requireVerifiedUser: async () => { if (!user) throw redirectError; return user; },
      requireAdmin: async () => { if (user?.role !== 'ADMIN') throw redirectError; return user; }
    },
    '@/lib/rate-limit': { assertRateLimit: async () => { if (failRate) throw Object.assign(new Error(), { name: 'RateLimitError' }); }, isRateLimitError: e => e.name === 'RateLimitError' },
    '@/lib/transaction-lock': { acquireTransactionLock: async (_tx, key) => locks.push(key) },
    '@/lib/markdown': { renderMarkdown: async text => `<p>${text}</p>` }
  });
  return { actions, poll, votes, created, locks, setUser: value => { user = value; }, limit: () => { failRate = true; } };
}

test('poll validation enforces bounded distinct choices and leaves ordinary announcements unchanged', () => {
  assert.deepEqual(polls.parseAnnouncementPoll(data(' Oui \r\n\r\n Non ')), { question: 'Votre avis ?', options: ['Oui', 'Non'] });
  for (const options of ['Oui', 'Oui\noui', 'é\ne\u0301', Array.from({ length: 9 }, (_, i) => String(i)).join('\n'), 'x'.repeat(161) + '\nNon']) {
    assert.throws(() => polls.parseAnnouncementPoll(data(options)), polls.AnnouncementInputError);
  }
  for (const question of ['', 'x'.repeat(241)]) {
    const form = data(); form.set('pollQuestion', question);
    assert.throws(() => polls.parseAnnouncementPoll(form), polls.AnnouncementInputError);
  }
  const form = data('invalid'); form.delete('includePoll');
  assert.equal(polls.parseAnnouncementPoll(form), null);
});

test('only admins create polls; invalid forms preserve input and no partial announcement is created', async () => {
  const f = fixture(), form = data('Oui');
  await assert.rejects(f.actions.createAnnouncementFormAction('fr', { error: '' }, form), e => e === redirectError);
  f.setUser({ id: 1, role: 'ADMIN' });
  for (const locale of ['fr', 'en']) {
    assert.ok((await f.actions.createAnnouncementFormAction(locale, { error: '' }, form)).error);
    assert.equal(f.created.length, 0); assert.equal(form.get('pollOptions'), 'Oui');
  }
  await assert.rejects(f.actions.createAnnouncementFormAction('fr', { error: '' }, data()), e => e === redirectError);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].pollQuestion, 'Votre avis ?');
  assert.deepEqual(JSON.parse(JSON.stringify(f.created[0].pollOptions.create)), [{ label: 'Oui', position: 0 }, { label: 'Non', position: 1 }]);
  const normal = data(); normal.delete('includePoll');
  await assert.rejects(f.actions.createAnnouncementFormAction('en', { error: '' }, normal), e => e === redirectError);
  assert.equal(f.created[1].pollQuestion, undefined);
});

test('votes are unique, editable, scoped to their poll and refused after closure, including stale forms', async () => {
  const f = fixture(), form = new FormData(); form.set('optionId', '10');
  const vote = () => f.actions.voteAnnouncementPollAction(1, 'fr', { error: '' }, form);
  await Promise.all(Array.from({ length: 8 }, vote));
  assert.equal(f.votes.size, 1); assert.equal(f.votes.get('1:4').optionId, 10);
  form.set('optionId', '11'); assert.equal((await vote()).error, '');
  assert.equal(f.votes.size, 1); assert.equal(f.votes.get('1:4').optionId, 11);
  for (const id of ['', '0', '99', 'NaN', '1.5']) {
    form.set('optionId', id); assert.ok((await vote()).error);
  }
  assert.equal(f.votes.get('1:4').optionId, 11);
  await assert.rejects(f.actions.setAnnouncementPollClosedAction(1, true, 'fr', {}, form), e => e === redirectError);
  f.setUser({ id: 1, role: 'ADMIN' });
  assert.equal((await f.actions.setAnnouncementPollClosedAction(1, true, 'fr', {}, form)).error, '');
  form.set('optionId', '10');
  assert.ok((await vote()).error); assert.equal(f.votes.size, 1);
  assert.equal((await f.actions.setAnnouncementPollClosedAction(1, false, 'fr', {}, form)).error, '');
  assert.equal((await vote()).error, ''); assert.equal(f.votes.size, 2);
  assert.ok(f.locks.every(key => key === 'announcement-poll:1'));
  assert.ok((await f.actions.voteAnnouncementPollAction(99, 'en', {}, form)).error);
  f.limit(); assert.match((await vote()).error, /Patientez/);
  f.setUser(null); await assert.rejects(vote(), e => e === redirectError);
});

test('poll HTML hides all results until voting or closure and exposes no voter identities', () => {
  const { AnnouncementPoll } = load('components/AnnouncementPoll.tsx', {
    '@/components/ActionFeedbackForm': { ActionFeedbackForm: ({ children }) => React.createElement('form', null, children) },
    '@/lib/actions/announcement-actions': { voteAnnouncementPollAction() {}, setAnnouncementPollClosedAction() {} }
  });
  const props = { announcementId: 1, question: 'Question', closed: false, selectedOptionId: null, canManage: false, locale: 'fr', options: [{ id: 10, label: 'Oui', votes: 3 }, { id: 11, label: 'Non', votes: 1 }] };
  const render = extra => renderToStaticMarkup(React.createElement(AnnouncementPoll, { ...props, ...extra }));
  const before = render({});
  assert.doesNotMatch(before, /75%|25%|3 votes|announcement-poll-track|Clore le sondage/);
  assert.match(before, /type="radio"/);
  const after = render({ selectedOptionId: 10 });
  assert.match(after, /75%/); assert.match(after, /4 votes/); assert.match(after, /Votre choix/);
  const closed = render({ closed: true });
  assert.match(closed, /75%/); assert.doesNotMatch(closed, /type="radio"/);
  assert.match(render({ closed: true, canManage: true, locale: 'en' }), /Reopen poll/);
  assert.doesNotMatch(render({ closed: true, options: props.options.map(o => ({ ...o, votes: 0 })) }), /NaN|Infinity/);
});

test('poll migration preserves existing announcements and enforces vote uniqueness, option membership and cascades', { skip: !process.env.MW_PGLITE_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "User" (id INTEGER PRIMARY KEY); CREATE TABLE "Announcement" (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO "User" VALUES (1),(2); INSERT INTO "Announcement" VALUES (1,\'Existing\'),(2,\'Other\');');
    await db.exec(readFileSync('prisma/migrations/20260924100000_announcement_polls/migration.sql', 'utf8'));
    assert.equal((await db.query('SELECT "pollQuestion" FROM "Announcement" WHERE id=1')).rows[0].pollQuestion, null);
    await db.exec(`INSERT INTO "AnnouncementPollOption" (id,"announcementId",label,position) VALUES (10,1,'Yes',0),(11,1,'No',1),(12,2,'Other',0);`);
    const insert = (a, u, o) => db.query('INSERT INTO "AnnouncementPollVote" ("announcementId","userId","optionId","updatedAt") VALUES ($1,$2,$3,NOW())', [a, u, o]);
    await insert(1, 1, 10);
    await assert.rejects(insert(1, 1, 11), /duplicate key/);
    await assert.rejects(insert(1, 2, 12), /foreign key/);
    await db.exec('UPDATE "AnnouncementPollVote" SET "optionId"=11 WHERE "userId"=1');
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AnnouncementPollVote"')).rows[0].n, 1);
    await db.exec('DELETE FROM "User" WHERE id=1');
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AnnouncementPollVote"')).rows[0].n, 0);
    await insert(1, 2, 10);
    await db.exec('DELETE FROM "Announcement" WHERE id=1');
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AnnouncementPollVote"')).rows[0].n, 0);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM "AnnouncementPollOption"')).rows[0].n, 1);
  } finally { await db.close(); }
});
