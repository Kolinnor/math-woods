import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatGuideMarkdown, parseGuideMarkdown, parseGuideSnapshot } from "../lib/concept-guide-files.ts";
import { pullGuides } from "../scripts/sync-concept-guides.mjs";
import { applyGuides } from "../scripts/apply-concept-guides.mjs";

const languages = ["en", "fr"];
const guide = (language, bodyMarkdown = "First paragraph.\n\nMiddle paragraph.\n\nLast paragraph.") => ({
  language, title: `Guide ${language}`, description: "Description", bodyMarkdown
});
const base = Object.fromEntries(languages.map((language) => [language, guide(language)]));
const changed = (value, from, to) => ({ ...value, bodyMarkdown: value.bodyMarkdown.replace(from, to) });
const remote = (site = base, deployed = base) => ({ version: 1, guides: Object.fromEntries(languages.map((language) => [
  language, { stored: site[language], deployedMarkdown: deployed[language] ? formatGuideMarkdown(deployed[language]) : null }
])) });

function fixture(t, { site = base, repository = base, deployed = base } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mathwoods-guide-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, "content", "guides", "concepts");
  mkdirSync(directory, { recursive: true });
  const file = (name) => join(directory, name);
  const setGuide = (language, value) => writeFileSync(file(`${language}.md`), formatGuideMarkdown(value));
  languages.forEach((language) => setGuide(language, repository[language]));
  writeFileSync(file("site-snapshot.json"), JSON.stringify({ version: 1, site, deployed }, null, 2) + "\n");
  return {
    root, file, setGuide,
    read: (language) => parseGuideMarkdown(readFileSync(file(`${language}.md`), "utf8"), language),
    tracked: () => ["en.md", "fr.md", "site-snapshot.json"].map((name) => readFileSync(file(name), "utf8"))
  };
}

function database(site = base, failLanguage) {
  let state = structuredClone(site);
  let writes = 0;
  return {
    get state() { return state; },
    get writes() { return writes; },
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, "Serializable");
      const pending = structuredClone(state);
      const result = await callback({ conceptContributorGuideContent: {
        async findMany() { return Object.values(pending).filter(Boolean).map((row) => ({ ...row, updatedAt: new Date(0) })); },
        async updateMany({ where, data }) {
          writes++;
          assert.deepEqual(where, { ...pending[where.language], updatedAt: new Date(0) });
          if (where.language === failLanguage) return { count: 0 };
          pending[where.language] = { language: where.language, ...data };
          return { count: 1 };
        },
        async createMany({ data: [row], skipDuplicates }) {
          writes++;
          assert.equal(skipDuplicates, true);
          if (row.language === failLanguage) return { count: 0 };
          pending[row.language] = row;
          return { count: 1 };
        }
      } });
      state = pending;
      return result;
    }
  };
}

test("Markdown round trip preserves LaTeX, quotes, code and multiline descriptions", () => {
  const value = { ...guide("fr", "# Définition\n\n$\\frac{a}{b}$ et `x'y` : https://example.com/a'b"), title: 'Un "guide"', description: "L'idée\nDeuxième ligne" };
  assert.deepEqual(parseGuideMarkdown(formatGuideMarkdown(value).replaceAll("\n", "\r\n"), "fr"), value);
  assert.throws(() => parseGuideMarkdown(formatGuideMarkdown(guide("fr")), "de"), /Unsupported guide language/);
  assert.throws(() => parseGuideMarkdown("---\ntitle: Test\ntitle: Again\n---\nBody", "fr"), /duplicate/);
  assert.throws(() => formatGuideMarkdown(guide("fr", "<<<<<<< repository\nConflict")), /conflict markers/);
  assert.throws(() => parseGuideSnapshot({ version: 1, site: { fr: base.fr } }), /Missing en/);
});

test("unchanged files and CRLF produce no changes", (t) => {
  const f = fixture(t);
  assert.deepEqual(pullGuides({ root: f.root, remote: remote() }), []);
  writeFileSync(f.file("fr.md"), formatGuideMarkdown(base.fr).replaceAll("\n", "\r\n"));
  assert.deepEqual(pullGuides({ root: f.root, remote: remote() }), []);
});

test("site edits and repository corrections merge, and repeated preparation is idempotent", (t) => {
  const local = { ...base, fr: changed(base.fr, "First", "Local first") };
  const site = { ...base, fr: changed(base.fr, "Last", "Site last") };
  const f = fixture(t, { repository: local });
  assert.equal(pullGuides({ root: f.root, remote: remote(site) }).length, 2);
  assert.match(f.read("fr").bodyMarkdown, /Local first/);
  assert.match(f.read("fr").bodyMarkdown, /Site last/);
  assert.deepEqual(pullGuides({ root: f.root, remote: remote(site) }), []);
  const nextSite = { ...site, fr: changed(site.fr, "Site last", "New site last") };
  pullGuides({ root: f.root, remote: remote(nextSite) });
  assert.match(f.read("fr").bodyMarkdown, /Local first/);
  assert.match(f.read("fr").bodyMarkdown, /New site last/);
});

test("a new deployed image becomes the common ancestor", (t) => {
  const f = fixture(t);
  const deployed = { ...base, fr: changed(base.fr, "First", "Deployed first") };
  f.setGuide("fr", deployed.fr);
  const site = { ...deployed, fr: changed(deployed.fr, "Deployed first", "Edited on site") };
  pullGuides({ root: f.root, remote: remote(site, deployed) });
  assert.deepEqual(f.read("fr"), site.fr);
});

test("first deployment uses the captured database snapshot without requiring a migration", (t) => {
  const deployed = { en: null, fr: null };
  const f = fixture(t, { deployed });
  const site = { ...base, en: changed(base.en, "First", "Site first") };
  pullGuides({ root: f.root, remote: remote(site, deployed) });
  assert.deepEqual(f.read("en"), site.en);
});

test("check reports pending changes without writing any files", (t) => {
  const f = fixture(t);
  const before = f.tracked();
  const site = { ...base, en: changed(base.en, "First", "Site first") };
  assert.equal(pullGuides({ root: f.root, remote: remote(site), check: true }).length, 2);
  assert.deepEqual(f.tracked(), before);
});

test("conflict leaves BOTH languages and snapshot untouched; manual resolution survives later pulls", (t) => {
  const f = fixture(t, { repository: { ...base, fr: changed(base.fr, "First", "Local first") } });
  const site = { en: changed(base.en, "Last", "Site last"), fr: changed(base.fr, "First", "Site first") };
  const before = f.tracked();
  assert.throws(() => pullGuides({ root: f.root, remote: remote(site), check: true }), /Guide conflict: fr/);
  assert.equal(existsSync(join(f.root, "runtime")), false);
  assert.throws(() => pullGuides({ root: f.root, remote: remote(site) }), /Guide conflict: fr/);
  assert.deepEqual(f.tracked(), before);
  const artifacts = join(f.root, "runtime", "guide-sync-conflicts");
  assert.match(readFileSync(join(artifacts, "fr.merge.md"), "utf8"), /<<<<<<< repository/);
  assert.deepEqual(parseGuideMarkdown(readFileSync(join(artifacts, "fr.site.md"), "utf8"), "fr"), site.fr);
  const resolved = changed(base.fr, "First", "Manually combined first");
  f.setGuide("fr", resolved);
  const newerSite = { ...site, fr: changed(site.fr, "Site first", "Newer first") };
  assert.throws(() => pullGuides({ root: f.root, remote: remote(newerSite), resolved: ["fr"] }), /changed again/);
  pullGuides({ root: f.root, remote: remote(site), resolved: ["fr"] });
  assert.deepEqual(f.read("fr"), resolved);
  assert.deepEqual(f.read("en"), site.en);
  assert.deepEqual(pullGuides({ root: f.root, remote: remote(site) }), []);
});

test("malformed remote content cannot partially update the other language", (t) => {
  const f = fixture(t);
  const before = f.tracked();
  const site = { en: changed(base.en, "First", "Site first"), fr: { ...base.fr, title: "" } };
  assert.throws(() => pullGuides({ root: f.root, remote: remote(site) }), /Invalid fr guide title/);
  assert.deepEqual(f.tracked(), before);
});

test("import applies a reviewed correction once and check is read-only", async (t) => {
  const repository = { ...base, fr: changed(base.fr, "First", "Corrected first") };
  const f = fixture(t, { repository });
  const db = database();
  assert.deepEqual(await applyGuides(db, { root: f.root, check: true }), ["fr"]);
  assert.equal(db.writes, 0);
  assert.deepEqual(await applyGuides(db, { root: f.root }), ["fr"]);
  assert.deepEqual(db.state, repository);
  assert.deepEqual(await applyGuides(db, { root: f.root }), []);
  assert.equal(db.writes, 1);
});

test("site edit after preparation prevents ALL imports, including rollback of an old release", async (t) => {
  const f = fixture(t, { repository: { ...base, en: changed(base.en, "First", "Local first") } });
  const db = database({ ...base, fr: changed(base.fr, "First", "New site first") });
  await assert.rejects(applyGuides(db, { root: f.root }), /changed on the site after preparation: fr/);
  assert.equal(db.writes, 0);
});

test("a race on the second language rolls back the first language update", async (t) => {
  const repository = Object.fromEntries(languages.map((language) => [language, changed(base[language], "First", "Updated first")]));
  const f = fixture(t, { repository });
  const db = database(base, "fr");
  await assert.rejects(applyGuides(db, { root: f.root }), /Concurrent edit of fr/);
  assert.equal(db.writes, 2);
  assert.deepEqual(db.state, base);
});

test("missing rows are created, but concurrent creation aborts atomically", async (t) => {
  const site = { en: null, fr: null };
  const f = fixture(t, { site, deployed: site });
  const racing = database(site, "fr");
  await assert.rejects(applyGuides(racing, { root: f.root }), /Concurrent edit of fr/);
  assert.deepEqual(racing.state, site);
  const db = database(site);
  assert.deepEqual(await applyGuides(db, { root: f.root }), languages);
  assert.deepEqual(db.state, base);
});
