// Run only against the dedicated local PostgreSQL container and app on port 3210.
import { chromium, expect as baseExpect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const connection = process.env.CITATION_TEST_DATABASE_URL;
const expect = baseExpect.configure({ timeout: 20000 });
if (!connection || new URL(connection).hostname !== "127.0.0.1" || new URL(connection).port !== "55436") throw new Error("Use the isolated local database on port 55436.");
const secret = process.env.AUTH_SECRET;
if (!secret || secret !== "mathwoods-citations-local-test-secret-20260905") throw new Error("Use the local test auth secret.");
const db = new PrismaClient({ datasourceUrl: connection });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const baseURL = "http://127.0.0.1:3210";
const prefix = `citations-browser-${Date.now()}`;
const contexts = [];
const diagnostics = [];
mkdirSync("runtime/citation-tests", { recursive: true });

try {
  async function account(name, role = "USER") {
    const user = await db.user.create({ data: { username: `${prefix}-${name}`, profileSlug: `${prefix}-${name}`, emailVerifiedAt: new Date(), role } });
    const token = randomUUID();
    await db.session.create({ data: { userId: user.id, tokenHash: createHmac("sha256", secret).update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 1000 } });
    contexts.push(context);
    await context.addCookies([{ name: "math_woods_session", value: token, url: baseURL }, { name: "math-woods-language", value: "fr", url: baseURL }]);
    const page = await context.newPage();
    page.on("pageerror", (error) => diagnostics.push(error.message));
    page.setDefaultTimeout(20000);
    return { user, page, context };
  }
  const author = await account("author");
  const reader = await account("reader");
  const admin = await account("admin", "ADMIN");
  const book = await db.libraryReference.create({ data: { slug: prefix, canonicalTitle: "Éléments", authors: "Euclide", publisher: prefix, referenceType: "BOOK", status: "PUBLISHED", dedupeKey: prefix } });
  await db.libraryReference.create({ data: { slug: `${prefix}-draft`, canonicalTitle: "Invisible catalogue draft", status: "DRAFT", dedupeKey: `${prefix}-draft` } });
  const problem = await db.problem.create({ data: {
    slug: prefix, title: "Test des références", bodyMarkdown: "Démontrer que $1+1=2$.", bodyHtml: "<p>Démontrer que 1+1=2.</p>", authorId: author.user.id, language: "fr", thread: { create: {} },
    libraryReferences: { create: [
      { citationKey: "free-original", text: "Ancienne référence", role: "SOURCE" },
      { citationKey: "hidden-original", text: "SECRET-CITATION-NEVER-IN-UNSOLVED-HTML", spoiler: true, role: "PROOF" }
    ] }
  } });
  const path = `/problems/${problem.slug}`;
  const page = author.page;
  await page.goto(`${path}/edit`);
  const editor = page.locator(".problem-citation-editor");
  await expect(editor).toBeVisible();
  await expect(editor.getByText('Vous pouvez laisser les références vides.')).toBeVisible();
  await editor.getByRole('checkbox', { name: 'Original', exact: true }).check();
  await editor.locator("fieldset").first().locator("textarea").first().fill("Olympiades 2026, exercice 3");
  await editor.getByRole("button", { name: "Rechercher dans le catalogue" }).click();
  const dialog = page.getByRole("dialog", { name: "Rechercher une référence" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Titre, auteur, ISBN ou DOI").fill(`euclide ${prefix}`);
  await dialog.getByRole("button", { name: "Choisir", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  await expect(editor.locator('fieldset').last().locator('details')).not.toHaveAttribute('open', '');
  await editor.locator('fieldset').last().locator('summary').click();
  await editor.locator('fieldset').last().getByRole('textbox', { name: 'Précisions supplémentaires' }).fill("Livre I, proposition 10");
  await page.reload();
  await expect(editor.getByText("Brouillon de références récupéré.")).toBeVisible();
  await expect(editor.locator('fieldset').last().getByRole('textbox', { name: 'Précisions supplémentaires', includeHidden: true })).toHaveValue("Livre I, proposition 10");
  await expect(editor.getByRole('checkbox', { name: 'Original', exact: true })).toBeChecked();
  await expect(editor.locator("fieldset").first().locator("textarea").first()).toHaveValue("Olympiades 2026, exercice 3");
  await page.locator('.problem-compose-details-toggle').click();
  await page.locator('input[name="editSummary"]').fill("Références simplifiées");
  await page.locator('form.problem-compose-form button[type="submit"]').first().click();
  await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  await expect(page.locator(".problem-citations-reading")).toContainText("Euclide — Éléments");
  await expect(page.locator(".problem-citations-reading")).toContainText("Livre I, proposition 10");
  await expect(page.locator(".problem-citations-reading")).toContainText('Problème original');
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), `mw-citations:${author.user.id}:problem:${problem.id}`)).toBeNull();
  let stored = await db.problemLibraryReference.findMany({ where: { problemId: problem.id } });
  assert.equal(stored.length, 3);
  assert.equal(stored.find(c => c.referenceId === book.id).note, "Livre I, proposition 10");
  assert.equal((await db.problem.findUnique({ where: { id: problem.id } })).isOriginal, true);
  const savedRevision = await db.pageRevision.findFirst({ where: { pageType: "PROBLEM", pageId: problem.id }, orderBy: { id: "desc" } });
  const translated = await db.problem.create({ data: { slug: `${prefix}-en`, title: 'Reference test', bodyMarkdown: 'Prove it.', bodyHtml: '<p>Prove it.</p>', authorId: author.user.id, language: 'en', isOriginal: true, translationGroupId: problem.translationGroupId,
    libraryReferences: { create: { citationKey: 'translated-book', referenceId: book.id, text: 'Euclid — Elements', note: 'Livre I, proposition 10' } } } });
  console.log("PASS: free entry, catalogue search, draft reload, save, successful draft cleanup");

  await reader.page.goto(path);
  assert.equal((await reader.page.content()).includes("SECRET-CITATION"), false);
  const exported = await reader.context.request.get(`${path}/export`);
  const markdown = await exported.text();
  assert.ok(markdown.includes("Olympiades 2026"));
  assert.equal(markdown.includes("SECRET-CITATION"), false);
  await reader.page.goto(`${path}/edit`);
  assert.equal((await reader.page.content()).includes("SECRET-CITATION"), false);
  await reader.page.locator(".problem-citation-editor fieldset").first().locator("textarea").first().fill("Correction proposée par un contributeur");
  await reader.page.getByRole('checkbox', { name: 'Original', exact: true }).uncheck();
  await reader.page.locator('.problem-compose-details-toggle').click();
  await reader.page.locator('input[name="editSummary"]').fill("Proposition sur les références");
  await reader.page.locator('form.problem-compose-form button[type="submit"]').first().click();
  await expect(reader.page).toHaveURL(/editProposal=submitted/);
  const proposal = await db.problemEditProposal.findFirst({ where: { problemId: problem.id, status: "PENDING" } });
  assert.ok(proposal);
  assert.equal(proposal.snapshot.isOriginal, false);
  assert.equal(proposal.snapshot.citations.length, 3);
  assert.equal(proposal.snapshot.citations.find(c => c.citationKey === "hidden-original").spoiler, true);
  await admin.page.goto(`/moderation/problem-edits/${proposal.id}`);
  await expect(admin.page.getByText("Correction proposée par un contributeur", { exact: false }).first()).toBeVisible();
  await admin.page.getByRole("button", { name: "Approve and publish" }).click();
  await expect(admin.page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  stored = await db.problemLibraryReference.findMany({ where: { problemId: problem.id } });
  assert.ok(stored.some(c => c.text === "Correction proposée par un contributeur"));
  assert.equal((await db.problem.findUnique({ where: { id: problem.id } })).isOriginal, false);
  assert.ok(stored.some(c => c.text.startsWith("SECRET-CITATION") && c.spoiler));
  console.log("PASS: hidden citations absent from page/edit/export, preserved through ordinary contributor proposal and admin approval");

  await reader.page.goto(`${path}/history`);
  assert.equal((await reader.page.content()).includes("SECRET-CITATION"), false);
  await db.problemAttempt.create({ data: { userId: reader.user.id, problemId: problem.id, status: "SOLVED", discussionUnlockAt: new Date() } });
  await reader.page.goto(path);
  await expect(reader.page.locator(".problem-citations-reading")).toContainText("SECRET-CITATION");
  console.log("PASS: history does not reveal hidden references; solved reader can see them");

  await reader.page.goto(`/contributing/references?problem=${problem.slug}&citation=free-original`);
  await expect(reader.page.locator('input[name="title"]')).toHaveValue("Correction proposée par un contributeur");
  await reader.page.locator('input[name="title"]').fill(`Ouvrage ${prefix}`);
  await reader.page.getByRole("button", { name: "Proposer au catalogue", exact: true }).click();
  await expect(reader.page.getByRole("status").filter({ hasText: "Proposition envoyée" })).toBeVisible();
  const proposedBook = await db.libraryReference.findFirst({ where: { canonicalTitle: `Ouvrage ${prefix}` } });
  assert.equal(proposedBook.status, "PENDING_REVIEW");
  assert.equal((await db.problemLibraryReference.findFirst({ where: { problemId: problem.id, citationKey: "free-original" } })).referenceId, null);
  const pendingSearch = await reader.context.request.get(`/api/references/search?q=${encodeURIComponent(`Ouvrage ${prefix}`)}`);
  assert.deepEqual((await pendingSearch.json()).references, []);
  console.log("PASS: optional catalogue proposal remains pending and does not change the problem citation");

  await page.goto(`${path}/history`);
  await page.locator(`#revision-${savedRevision.id} button[type="submit"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  await expect(page.locator(".problem-citations-reading")).toContainText("Olympiades 2026, exercice 3");
  assert.equal(await db.problemLibraryReference.count({ where: { problemId: problem.id } }), 3);
  console.log("PASS: history rollback restores all references and visibility");

  await page.goto(`${path}/edit`);
  await page.locator(".problem-citation-editor fieldset").first().locator("textarea").first().fill("Draft from the first editor");
  await admin.page.goto(`${path}/edit`);
  await admin.page.locator(".problem-citation-editor fieldset").first().locator("textarea").first().fill("Saved by the second editor");
  await admin.page.locator('.problem-citation-editor fieldset').last().locator('summary').click();
  await admin.page.locator('.problem-citation-editor fieldset').last().getByRole('textbox', { name: 'Précisions supplémentaires' }).fill('Livre I, proposition 11');
  await admin.page.locator('form.problem-compose-form button[type="submit"]').first().click();
  await expect(admin.page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  assert.equal((await db.problemLibraryReference.findFirst({ where: { problemId: translated.id } })).note, 'Livre I, proposition 11');
  await page.locator('form.problem-compose-form button[type="submit"]').first().click();
  await expect(page.locator('.problem-edit-conflict')).toBeVisible();
  assert.equal((await db.problemLibraryReference.findFirst({ where: { problemId: problem.id, citationKey: "free-original" } })).text, "Saved by the second editor");
  assert.ok(await page.evaluate((key) => localStorage.getItem(key), `mw-citations:${author.user.id}:problem:${problem.id}`));
  await page.reload();
  await expect(page.locator(".problem-citation-editor fieldset").first().locator("textarea").first()).toHaveValue("Draft from the first editor");
  await page.getByRole("button", { name: "Reprendre les références enregistrées" }).click();
  await expect(page.locator(".problem-citation-editor fieldset").first().locator("textarea").first()).toHaveValue("Saved by the second editor");
  console.log("PASS: concurrent edits report a conflict and keep the rejected draft after reload");
  await page.goto(`${path}/history`);
  await page.locator(`#revision-${savedRevision.id} button[type="submit"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
  const restoredTranslation = await db.problemLibraryReference.findFirst({ where: { problemId: translated.id } });
  assert.equal(restoredTranslation.note, 'Livre I, proposition 10');
  assert.equal((await db.problem.findUnique({ where: { id: problem.id } })).isOriginal, true);
  assert.equal(restoredTranslation.text, 'Euclid — Elements');
  console.log('PASS: catalogue passages propagate on edit and rollback without overwriting translated text or notes');

  await page.goto(`${path}/edit`);
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  assert.equal(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
  await editor.screenshot({ path: "runtime/citation-tests/editor-mobile.png" });
  await editor.getByRole("button", { name: "Rechercher dans le catalogue" }).click();
  await expect(dialog.getByLabel("Titre, auteur, ISBN ou DOI")).toBeFocused();
  await dialog.getByLabel("Titre, auteur, ISBN ou DOI").fill(`elements ${prefix}`);
  await expect(dialog.getByRole("button", { name: "Déjà ajoutée" }).first()).toBeVisible();
  await dialog.screenshot({ path: "runtime/citation-tests/search-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(editor.getByRole("button", { name: "Rechercher dans le catalogue" })).toBeFocused();
  await page.route("**/api/references/search?**", route => route.fulfill({ status: 503, body: "unavailable" }));
  await editor.getByRole("button", { name: "Rechercher dans le catalogue" }).click();
  await dialog.getByLabel("Titre, auteur, ISBN ou DOI").fill("missing reference");
  await expect(dialog.getByText("La recherche est indisponible. Vous pouvez utiliser un texte libre.")).toBeVisible();
  await dialog.getByRole("button", { name: "Utiliser un texte libre" }).click();
  await expect(editor.locator("fieldset").last().locator("textarea").first()).toHaveValue("missing reference");
  console.log("PASS: mobile layout, unaccented search, Escape and focus return, search error fallback");

  await reader.page.goto('/problems/new');
  await reader.page.locator('.cm-content').first().fill(`Création ${prefix}`);
  await reader.page.locator('.cm-content').nth(1).fill('Démontrer que $1+1=2$.');
  await reader.page.locator('.problem-citation-editor fieldset textarea').first().fill('Une simple référence dès la création');
  await reader.page.getByRole('checkbox', { name: 'Original', exact: true }).check();
  await reader.page.locator('.content-preview-button').click();
  await expect(reader.page.locator('.content-preview-dialog .problem-citations-reading')).toContainText('Une simple référence dès la création');
  await reader.page.keyboard.press('Escape');
  const newDraftKey = await reader.page.locator('input[name="citationDraftKey"]').inputValue();
  await reader.page.locator('form.problem-compose-form button[type="submit"]').first().click();
  await expect(reader.page).toHaveURL(/\/problems\/(?!new(?:\?|$))[^/?]+(?:\?|$)/);
  const createdProblem = await db.problem.findFirst({ where: { title: `Création ${prefix}` }, include: { libraryReferences: true } });
  assert.equal(createdProblem.libraryReferences[0].text, 'Une simple référence dès la création');
  assert.equal(createdProblem.libraryReferences[0].referenceId, null);
  assert.equal(createdProblem.isOriginal, true);
  await expect.poll(() => reader.page.evaluate(key => localStorage.getItem(key), newDraftKey)).toBeNull();
  console.log('PASS: ordinary contributor creates a problem with a free reference; full preview matches and success clears draft');
  await reader.context.addCookies([{ name: 'math-woods-language', value: 'en', url: baseURL }]);
  await reader.page.goto(`/problems/${createdProblem.slug}/edit?viewLanguage=en`);
  const englishEditor = reader.page.locator('.problem-citation-editor');
  await expect(englishEditor.getByText('It’s fine to leave references blank.')).toBeVisible();
  await expect(englishEditor.getByRole('checkbox', { name: 'Original', exact: true })).toBeChecked();
  await expect(englishEditor.getByText('Reference', { exact: true })).toHaveCount(0);
  await englishEditor.getByText('Additional details', { exact: true }).click();
  await expect(englishEditor.getByRole('textbox', { name: 'Additional details' })).toBeVisible();
  await expect(englishEditor.locator('fieldset select, fieldset input[type="url"]')).toHaveCount(0);
  const help = englishEditor.locator('.field-help');
  await help.focus();
  await expect(help).toHaveAttribute('data-tooltip', 'Check this box if you created this problem and it is not available elsewhere.');
  assert.equal(await help.evaluate(el => getComputedStyle(el, '::after').visibility), 'visible');
  await englishEditor.screenshot({ path: 'runtime/citation-tests/simplified-english.png' });
  await reader.context.addCookies([{ name: 'math-woods-language', value: 'fr', url: baseURL }]);
  await reader.page.goto(`/problems/${createdProblem.slug}/edit?viewLanguage=fr`);
  await expect(reader.page.locator('.problem-citation-original .field-help')).toHaveAttribute('data-tooltip', 'Cochez cette case si vous avez créé ce problème et qu’il n’est pas disponible ailleurs.');
  await reader.page.locator('.problem-citation-editor').screenshot({ path: 'runtime/citation-tests/simplified-french.png' });
  console.log('PASS: simplified fields and Original tooltip in French and English, keyboard focus and persisted original state');
  assert.deepEqual(diagnostics, []);
} catch (error) {
  for (let i = 0; i < contexts.length; i++) {
    const page = contexts[i].pages()[0];
    if (page) { console.error(`Page ${i}: ${page.url()}`); await page.screenshot({ path: `runtime/citation-tests/failure-${i}.png`, fullPage: true }).catch(() => {}); }
  }
  throw error;
} finally { await browser.close(); await db.$disconnect(); }
