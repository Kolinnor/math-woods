import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

// Exercise the actual components with a deterministic server-action transport.
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {ProblemCreateForm} from '@/components/ProblemCreateForm';
    import {ProblemDifficultyField} from '@/components/ProblemDifficultyField';
    import {ProblemDomainPicker} from '@/components/ProblemDomainPicker';
    import {ProblemLikePromptDialog} from '@/components/ProblemLikePromptDialog';
    import {fr} from '@/lib/i18n/dictionaries/fr';
    const root = createRoot(document.getElementById('root')); let sequence = 0;
    window.calls = []; window.likes = 0;
    const labels = {...fr.contentEditor, missingDifficulty:'Difficulty missing', missingDomain:'Domain missing', missingFieldsHeading:'Missing fields'};
    window.mount = (mode) => root.render(mode === 'form' ?
      <ProblemCreateForm key={++sequence} labels={labels} requireClassification>
        <input name="title" aria-label="Title" defaultValue="Title" />
        <textarea name="bodyMarkdown" aria-label="Statement" defaultValue="Statement" />
        <input name="originNote" aria-label="Reference note" defaultValue="" />
        <input type="checkbox" name="listed" aria-label="Listed" defaultChecked />
        <ProblemDifficultyField allowUnset label="Difficulty" />
        <ProblemDomainPicker allowEmpty domains={[{value:'algebra',label:'Algebra',domain:'ALGEBRA'}]} initialValues={[]} labels={fr.problems.domainPicker} locale="en" />
        <button type="submit">Publish</button>
      </ProblemCreateForm> : <ProblemLikePromptDialog key={++sequence} onceKey={String(sequence)}
        labels={{question:'Enjoyed this problem?',message:'You can like it.',like:'Like',close:'Close'}}
        onLike={() => window.likes++} />);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "mock-actions", setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/actions\/problem-actions$/ }, () => ({ path: "actions", namespace: "mock" }));
    builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: `
      export async function createProblemFormAction(state, data) {
        window.calls.push(Object.fromEntries(data));
        await new Promise(resolve => setTimeout(resolve, 30));
        return window.reply ?? {error:null};
      }`, loader: "js" }));
  } }]
});
const css = readFileSync("app/styles/64-problems.css", "utf8");
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("http://pr-review.test/**", route => route.fulfill({ contentType: "text/html", body: '<button id="outside">Outside</button><div id="root"></div>' }));
    await page.goto("http://pr-review.test/");
    await page.addStyleTag({content: css});
    await page.addScriptTag({content: bundle.outputFiles[0].text});
    await page.evaluate(() => window.mount("form"));
    await page.getByLabel("Title", {exact:true}).fill("Preserved title");
    await page.getByLabel("Statement", {exact:true}).fill("Preserved statement");
    await page.getByLabel("Reference note").fill("Book 1, Proposition 24");
    await page.getByLabel("Listed", {exact:true}).uncheck();
    await page.getByRole("button", {name:"Publish",exact:true}).click();
    await page.getByText("Difficulty missing", {exact:true}).waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    await page.getByRole("slider").focus(); await page.keyboard.press("ArrowRight");
    await page.locator(".domain-picker-tile").click();
    await page.evaluate(() => { window.reply = {error:null,conceptLinkReminder:true}; });
    await page.getByRole("button", {name:"Publish",exact:true}).click();
    await page.locator(".concept-link-reminder").waitFor();
    assert.equal(await page.getByLabel("Title", {exact:true}).inputValue(), "Preserved title");
    assert.equal(await page.getByLabel("Statement", {exact:true}).inputValue(), "Preserved statement");
    assert.equal(await page.getByLabel("Reference note").inputValue(), "Book 1, Proposition 24");
    assert.equal(await page.getByLabel("Listed", {exact:true}).isChecked(), false);
    assert.equal(await page.locator('[name="difficulty"]').inputValue(), "51");
    assert.equal(await page.locator('[name="domains"]').inputValue(), "algebra");
    await page.evaluate(() => { window.reply = {error:"Title unchanged",errorKind:"same-translation-title"}; });
    await page.getByRole("button", {name:"Publish",exact:true}).click();
    await page.locator(".translation-link-warning").waitFor();
    assert.equal(await page.evaluate(() => window.calls.at(-1).conceptLinkReminderSeen), "1");
    await page.evaluate(() => { window.reply = {error:null}; });
    await page.locator('.translation-link-warning button').click();
    await page.waitForFunction(() => window.calls.length === 3);
    assert.equal(await page.evaluate(() => window.calls.at(-1).title), "Preserved title");
    assert.equal(await page.evaluate(() => Object.values(window.calls.at(-1)).includes("confirm")), true);
    // Non-modal invitation does not steal focus, accepts Escape, and respects its cooldown.
    await page.evaluate(() => { window.localStorage.clear(); window.mount("prompt"); });
    await page.locator("#outside").focus();
    await page.locator(".problem-like-prompt-dialog").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), "outside");
    assert.equal(await page.locator(":modal").count(), 0);
    const box = await page.locator(".problem-like-prompt-dialog").boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390);
    await page.keyboard.press("Escape");
    await page.locator(".problem-like-prompt-dialog").waitFor({state:"detached"});
    await page.evaluate(() => window.mount("prompt"));
    await page.waitForTimeout(850);
    assert.equal(await page.locator(".problem-like-prompt-dialog").count(), 0);
    await page.evaluate(() => { window.localStorage.clear(); window.mount("prompt"); });
    await page.getByRole("button", {name:"Like",exact:true}).click();
    await page.locator(".problem-like-prompt-dialog").waitFor({state:"detached"});
    assert.equal(await page.evaluate(() => window.likes), 1);
    assert.deepEqual(errors, []);
    console.log(`${name}: classification, field preservation, confirmation, non-modal prompt and cooldown passed`);
  } finally { await browser.close(); }
}
