import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as validation from "../lib/problem-create-validation.ts";
import * as languages from "../lib/languages.ts";
import * as limits from "../lib/content-limits.ts";
import * as reminder from "../lib/problem-link-reminder.ts";
import * as titleGuard from "../lib/translation-title-guard.ts";
import * as additional from "../lib/additional-concept-links.ts";
import * as history from "../lib/content-history.ts";
import * as feedback from "../lib/form-feedback.ts";
import * as permissions from "../lib/permissions.ts";
const require = createRequire(import.meta.url);
const actionsCode = ts.transpileModule(readFileSync("lib/actions/problem-actions.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
function load(overrides = {}) {
  const modules = {
    "@prisma/client": require("@prisma/client"),
    "@/lib/problem-create-validation": validation,
    "@/lib/problem-link-reminder": reminder,
    "@/lib/languages": languages, "@/lib/content-limits": limits,
    "@/lib/translation-title-guard": titleGuard,
    "@/lib/content-history": history, "@/lib/additional-concept-links": additional,
    "@/lib/form-feedback": feedback, "@/lib/permissions": permissions,
    "@/lib/auth": { requireVerifiedUser: async () => ({ id: 1, role: "OWNER" }) },
    "@/lib/rate-limit": { assertRateLimit: async () => {} },
    ...overrides
  };
  const exports = {};
  new Function("require", "exports", actionsCode)(name => modules[name] ?? {}, exports);
  return exports;
}
function form(difficulty = "50", domains = ["algebra"]) {
  const data = new FormData();
  data.set("title", "Problem"); data.set("language", "fr"); data.set("bodyMarkdown", "Statement");
  data.set("difficulty", difficulty);
  for (const domain of domains) data.append("domains", domain);
  return data;
}

test("classification requires an explicit valid difficulty and real domains, including Other", () => {
  for (const value of ["", "0", "101", "1.5", "NaN"]) {
    assert.throws(() => validation.assertProblemClassification(form(value)), e => e.missingFields.includes("difficulty"));
  }
  for (const domains of [[], [""], ["unknown-domain"], ["algebra", "invalid"]]) {
    assert.throws(() => validation.assertProblemClassification(form("50", domains)), e => e.missingFields.includes("domain"));
  }
  for (const domain of ["algebra", "algebra-permutations", "other", "linear-algebra-geometry"]) {
    assert.doesNotThrow(() => validation.assertProblemClassification(form("50", [domain])));
  }
});

test("direct creation and form submission enforce classification even with a malformed translation group", async () => {
  const actions = load();
  for (const translationGroup of [null, "", "!!!"]) {
    const data = form("", []);
    if (translationGroup !== null) data.set("translationGroupId", translationGroup);
    await assert.rejects(actions.createProblemAction(data), validation.ProblemClassificationError);
    const state = await actions.createProblemFormAction({ error: null }, data);
    assert.equal(state.errorKind, "missing-fields");
    assert.deepEqual(state.missingFields, ["difficulty", "domain"]);
  }
  const state = await actions.createProblemFormAction({ error: null }, form("50", ["invented"]));
  assert.deepEqual(state.missingFields, ["domain"]);
});

test("editing an attached exercise or a problem with additional links avoids a false reminder", async () => {
  const continued = new Error("classification reached after reminder");
  for (const kind of ["exercise", "additional", "unlinked"]) {
    const previous = { id: 7, authorId: 1, title: "Problem", language: "fr", bodyMarkdown: "Statement",
      version: 1, translationGroupId: "family", additionalConceptSlugs: kind === "additional" ? ["polynomial"] : [] };
    let queried = 0;
    const actions = load({
      "@/lib/db": { prisma: {
        problem: { findUnique: async () => previous },
        conceptExercise: { findFirst: async ({ where }) => {
          queried++; assert.equal(where.problem.translationGroupId, "family");
          return kind === "exercise" ? { conceptId: 3 } : null;
        } }
      } },
      "@/lib/problem-edit-access": { canPublishProblemEditForProblem: async () => true },
      "@/lib/problems": { parseProblemDifficulty: () => { throw continued; } }
    });
    const data = form(); data.set("baseVersion", "1");
    if (kind === "unlinked") {
      const result = await actions.updateProblemAction(7, { status: "idle" }, data);
      assert.equal(result.status, "concept-link-reminder");
    } else {
      await assert.rejects(actions.updateProblemAction(7, { status: "idle" }, data), e => e === continued);
    }
    assert.equal(queried, kind === "additional" ? 0 : 1);
  }
});
