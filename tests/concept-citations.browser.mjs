// This runner is restricted to the disposable database and local app.
import { chromium, expect as baseExpect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { parse } from '@retorquere/bibtex-parser';
const connection = process.env.CITATION_TEST_DATABASE_URL, secret = process.env.AUTH_SECRET;
if (!connection || new URL(connection).hostname !== '127.0.0.1' || new URL(connection).port !== '55436' || secret !== 'mathwoods-citations-local-test-secret-20260905') throw new Error('Use the isolated test database and auth secret.');
const db = new PrismaClient({ datasourceUrl: connection });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const expect = baseExpect.configure({ timeout: 20000 }), baseURL = 'http://127.0.0.1:3210', prefix = `concept-browser-${Date.now()}`, errors = [], contexts = [];
try {
  async function account(name, role = 'USER') {
    const user = await db.user.create({ data: { username: `${prefix}-${name}`, profileSlug: `${prefix}-${name}`, role, emailVerifiedAt: new Date(), conceptGuideAcknowledgedAt: new Date() } });
    const token = randomUUID();
    await db.session.create({ data: { userId: user.id, tokenHash: createHmac('sha256', secret).update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 1000 } }); contexts.push(context);
    await context.addCookies([{ name: 'math_woods_session', value: token, url: baseURL }, { name: 'math-woods-language', value: 'fr', url: baseURL }]);
    const page = await context.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(e.message));
    return { user, context, page };
  }
  const author = await account('author'), member = await account('member'), admin = await account('admin', 'ADMIN');
  const book = await db.libraryReference.create({ data: { slug: prefix, dedupeKey: prefix, canonicalTitle: `Livre ${prefix}`, authors: 'Auteur', referenceType: 'BOOK', status: 'PUBLISHED' } });
  const concept = await db.concept.create({ data: { slug: prefix, title: 'Concept avec références', bodyMarkdown: 'Une définition.', bodyHtml: '<p>Une définition.</p>', createdById: author.user.id, language: 'fr', libraryReferences: { create: { citationKey: 'free', text: 'Source initiale', role: 'FURTHER_READING' } } } });
  const path = `/concepts/${concept.slug}`, page = author.page;
  await page.goto(`${path}/edit`);
  const editor = page.locator('.problem-citation-editor');
  await expect(editor).toBeVisible(); await expect(editor.getByRole('checkbox')).toHaveCount(0);
  await expect(editor.locator('details[open]')).toHaveCount(0);
  await editor.locator('fieldset textarea').first().fill('Article https://example.com/article');
  await editor.getByRole('button', { name: 'Rechercher dans le catalogue' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rechercher une référence' });
  await dialog.getByLabel('Titre, auteur, ISBN ou DOI').fill(prefix);
  await dialog.getByRole('button', { name: 'Choisir', exact: true }).click();
  await editor.locator('fieldset').last().locator('summary').click();
  await editor.locator('fieldset').last().getByRole('textbox', { name: 'Précisions supplémentaires' }).fill('Chapitre 2');
  await page.reload();
  await expect(editor.getByText('Brouillon de références récupéré.')).toBeVisible();
  await page.locator('.content-preview-button').click();
  await expect(page.locator('.content-preview-dialog .problem-citations-reading')).toContainText('Article https://example.com/article');
  await page.keyboard.press('Escape');
  await page.locator('.content-editor-actions button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  await expect(page.locator('.problem-citations-reading a[href="https://example.com/article"]')).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), `mw-citations:${author.user.id}:concept:${concept.id}`)).toBeNull();
  const saved = await db.pageRevision.findFirstOrThrow({ where: { pageType: 'CONCEPT', pageId: concept.id }, orderBy: { id: 'desc' } });
  assert.equal(saved.conceptSnapshot.citations.length, 2);
  const translated = await db.concept.create({ data: { slug: `${prefix}-en`, title: 'English concept', language: 'en', translationGroupId: concept.translationGroupId, bodyMarkdown: 'Definition.', bodyHtml: 'Definition.', createdById: author.user.id, libraryReferences: { create: { citationKey: 'translated-book', referenceId: book.id, text: 'Translated book title', note: 'Chapitre 2', role: 'FURTHER_READING' } } } });
  console.log('PASS: concept editor, catalogue access, collapsed details, draft restore, preview, stable save and clickable article');

  await member.page.goto(`${path}/edit`);
  await member.page.locator('.problem-citation-editor fieldset textarea').first().fill('Correction proposée');
  await member.page.locator('.problem-citation-editor fieldset').last().locator('summary').click();
  await member.page.locator('.problem-citation-editor fieldset').last().getByRole('textbox', { name: 'Précisions supplémentaires' }).fill('Chapitre 3');
  await member.page.locator('.content-editor-actions button[type="submit"]').click();
  await expect(member.page).toHaveURL(/editProposal=submitted/);
  const proposal = await db.conceptEditProposal.findFirstOrThrow({ where: { conceptId: concept.id, status: 'PENDING' } });
  assert.equal(proposal.snapshot.citations[0].text, 'Correction proposée');
  await admin.page.goto(`/moderation/concept-edits/${proposal.id}`);
  await expect(admin.page.getByText('Correction proposée', { exact: false }).first()).toBeVisible();
  await admin.page.getByRole('button', { name: 'Approve and publish' }).click();
  await expect(admin.page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  assert.equal((await db.conceptLibraryReference.findFirst({ where: { conceptId: translated.id } })).note, 'Chapitre 3');
  await page.goto(`${path}/history`);
  await page.locator(`#revision-${saved.id} button[type="submit"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  assert.equal((await db.conceptLibraryReference.findFirst({ where: { conceptId: translated.id } })).note, 'Chapitre 2');
  assert.equal((await db.conceptLibraryReference.findFirst({ where: { conceptId: translated.id } })).text, 'Translated book title');
  await expect(page.locator('.problem-citations-reading')).toContainText('Article https://example.com/article');
  await member.page.goto(`/contributing/references?concept=${concept.slug}&citation=free`);
  await expect(member.page.locator('[name="title"]')).toHaveValue('Article https://example.com/article');
  console.log('PASS: contributor proposal, admin approval, reference history/rollback, translation propagation, optional catalogue proposal');

  const anonymous = await browser.newContext({ baseURL }); contexts.push(anonymous);
  const publicJson = await anonymous.request.get(`${path}/export?format=json`);
  assert.equal(publicJson.status(), 200); assert.equal((await publicJson.json()).references.length, 2);
  const publicBib = await anonymous.request.get(`${path}/export?format=bibtex`);
  assert.equal(publicBib.status(), 200); const parsed = parse(await publicBib.text(), { raw: true, unsupported: 'ignore' });
  assert.equal(parsed.entries.length, 2); assert.equal(parsed.entries[0].fields.title, undefined); assert.equal(parsed.entries[0].fields.author, undefined);
  const problem = await db.problem.create({ data: { slug: `${prefix}-problem`, title: 'Public exports', bodyMarkdown: 'Test.', bodyHtml: 'Test.', authorId: author.user.id, libraryReferences: { create: [{ citationKey: 'visible', text: 'Visible reference' }, { citationKey: 'secret', text: 'NEVER-LEAK-SECRET', spoiler: true }] } } });
  for (const format of ['json', 'bibtex']) {
    const response = await anonymous.request.get(`/problems/${problem.slug}/export?format=${format}`);
    assert.equal(response.status(), 200); const text = await response.text();
    assert.ok(text.includes('Visible reference')); assert.equal(text.includes('NEVER-LEAK-SECRET'), false);
    const authorResponse = await author.context.request.get(`/problems/${problem.slug}/export?format=${format}`);
    assert.ok((await authorResponse.text()).includes('NEVER-LEAK-SECRET'));
  }
  assert.equal((await anonymous.request.get('/library/references/export?format=json')).status(), 401);
  console.log('PASS: anonymous per-page BibTeX/JSON exports, free refs without invented metadata, hidden problem refs filtered, full catalogue still private');

  await author.page.goto('/concepts/new');
  await author.page.locator('.cm-content').first().fill(`Création ${prefix}`);
  await author.page.locator('.cm-content').nth(1).fill('Une définition avec une référence.');
  await author.page.locator('.problem-citation-editor fieldset textarea').first().fill('Référence de création');
  await author.page.locator('.content-editor-actions button[type="submit"]').click();
  await expect(author.page).toHaveURL(/\/concepts\/(?!new(?:\?|$))[^/?]+(?:\?|$)/, { timeout: 60000 });
  const created = await db.concept.findFirstOrThrow({ where: { title: `Création ${prefix}` }, include: { libraryReferences: true } });
  assert.equal(created.libraryReferences[0].text, 'Référence de création');
  await author.context.addCookies([{ name: 'math-woods-language', value: 'en', url: baseURL }]);
  await author.page.goto(`/concepts/${created.slug}/edit?viewLanguage=en`);
  await expect(author.page.locator('.problem-citation-editor').getByText('It’s fine to leave references blank.')).toBeVisible();
  await expect(author.page.locator('.problem-citation-editor').getByRole('checkbox')).toHaveCount(0);
  await author.page.locator('.problem-citation-editor').screenshot({ path: 'runtime/citation-tests/concept-editor-en.png' });
  console.log('PASS: ordinary contributor creates concept with a free reference, English minimal form');
  assert.deepEqual(errors, []);
} catch (error) {
  for (const [i, context] of contexts.entries()) { const page = context.pages()[0]; if (page) { console.error(i, page.url()); await page.screenshot({ path: `runtime/citation-tests/concept-failure-${i}.png`, fullPage: true }).catch(() => {}); } }
  throw error;
} finally { await browser.close(); await db.$disconnect(); }
