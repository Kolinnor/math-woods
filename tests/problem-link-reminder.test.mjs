import test from "node:test";
import assert from "node:assert/strict";
import {
  CONCEPT_LINK_REMINDER_FIELD,
  conceptLinkReminderAcknowledged,
  hasConceptLink,
  needsConceptLinkReminder
} from "../lib/problem-link-reminder.ts";

test("recognizes concept links while ignoring problem, external and code links", () => {
  assert.equal(hasConceptLink("Let $p$ be a [[polynomial|polynomial]]."), true);
  assert.equal(hasConceptLink("See [this problem](/problems/roots)."), false);
  assert.equal(hasConceptLink("See https://example.org/page."), false);
  assert.equal(hasConceptLink("See [polynomial](/concepts/polynomial)."), true);
  assert.equal(hasConceptLink("See [polynomial](https://mathwoods.org/concepts/polynomial)."), true);
  assert.equal(hasConceptLink("See [polynomial](https://example.org/concepts/polynomial)."), false);
  assert.equal(hasConceptLink("Use `[[not a link]]` literally."), false);
});

test("reminds when no concept is linked, unless already acknowledged", () => {
  const body = "Find all real $x$ such that $x^2 = x$.";
  assert.equal(needsConceptLinkReminder(body, false), true);
  assert.equal(needsConceptLinkReminder(body, true), false);
  assert.equal(needsConceptLinkReminder("A [[polynomial]] question.", false), false);
  assert.equal(needsConceptLinkReminder("   ", false), false);
});

test("reads the acknowledgement field", () => {
  const data = new FormData();
  assert.equal(conceptLinkReminderAcknowledged(data), false);
  data.set(CONCEPT_LINK_REMINDER_FIELD, "1");
  assert.equal(conceptLinkReminderAcknowledged(data), true);
});

test("additional links and exercise attachments avoid false reminders", () => {
  assert.equal(needsConceptLinkReminder("Statement", false, { additionalConceptSlugs: ["polynomial"] }), false);
  assert.equal(needsConceptLinkReminder("Statement", false, { linkedConcept: true }), false);
  assert.equal(needsConceptLinkReminder("Statement", false, { additionalConceptSlugs: [], linkedConcept: false }), true);
});
