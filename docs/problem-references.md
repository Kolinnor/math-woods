# Problem references

Citation inputs become editable once the local draft has been restored. This prevents
typing during hydration from racing the restored controlled value. Choosing a catalogue
record focuses its card while keeping additional details closed; the contributor can
expand them explicitly.

Implemented from the [September 5 audit](problem-references-audit-2026-09-05.md).
Free text is the default in problem creation and editing; leaving it blank is allowed.
An optional "Original" checkbox records that the problem was created by its author
and is not available elsewhere. It is included in drafts, revisions, proposals,
translations, preview and export. Each citation has one "Additional details" field;
legacy passages, notes and URLs are combined without losing their text. Unedited
legacy structured metadata remains unchanged. The optional search
dialog queries published records in pages of ten results, supports accents and
localized titles, and leaves free entry available during a search failure.

## Storage and permissions

`ProblemLibraryReference` stores free citations (`referenceId = null`) and linked
citations. Stable `citationKey` values identify rows across edits and snapshots.
`text` retains a readable label even if the catalogue record is deleted. Links
accept only HTTP(S), without credentials. Limits: 20 citations, 2,000 characters
of text/URL, 1,000 for a legacy passage and 8,000 for additional details.

Verified contributors can search and propose references. Normal problem editing
permissions still decide whether a problem change is published or reviewed.
Catalogue proposals remain pending until admin review and never automatically
replace a free citation. Library management routes remain restricted.

Spoiler citations are omitted server-side from pages, editors, history and exports
until the reader solves a translation of the problem. Authors and editors can see
them. Contributions from other readers preserve citations they cannot see. History
also hides earlier versions of citation keys that were subsequently marked hidden.

Drafts are stored per account and problem/session. A successful save acknowledges
the exact submitted draft token; a newer draft in another tab is not cleared. A
conflict, failed request or maintenance interruption does not acknowledge the draft.
Recovered drafts keep their original baseline for conflict detection. Snapshots
from before this feature do not erase citations during merging or rollback.

## Migration and cleanup

Concepts share the same simple free-text editor, catalogue search, closed additional
details, preview and optional catalogue proposal. They have no Original or spoiler
checkboxes. Article URLs in citation text or notes become clickable links. Inline
Wikipedia-style footnote markers are not required by this first shared interface.

`ConceptLibraryReference` now stores nullable catalogue IDs, stable citation keys,
readable text and URLs. Migration `20260905230000_concept_citations` retains existing
catalogue links and imports unmatched legacy references, including distinct notes.
Legacy `ConceptReference` rows are mirrored on save for compatibility. Concept
revisions, proposals, approvals, rollback, translation and merging retain citations.
Deleted historical catalogue records are restored as free references. Shared
catalogue associations propagate across translations while local text and divergent
notes remain in their language. Drafts are scoped per account and concept/session.

Both content types offer anonymous per-page BibTeX and JSON exports; details are
documented in `docs/library.md`. Catalogue administration remains restricted.

Migration `20260905150000_problem_citations` adds fields and backfills existing
labels/URLs. It retains legacy source columns, existing notes and passages. Raw
BibTeX titles remain linked but are excluded from suggestions. Correcting such a
title through the admin form makes the record searchable again. Full bibliographic
metadata cannot be reconstructed reliably from a truncated citation key alone.

After migrations, with `DATABASE_URL` set for the intended database:

```sh
npm run references:check
npm run references:reconcile
```

The first command only reports the explicit Euclid mappings. The second applies
them in one serializable transaction. It reuses the general work, preserves notes
and both numbering systems where present, moves the passage onto problem/concept
links, and keeps old records for permanent redirects. A problem or concept citing
multiple source records stops the whole operation for manual review. Repeated
application is idempotent. Other editions and unrelated references are untouched.

`deploy/deploy.sh` runs the check and reconciliation after migrations and before
restarting the app, with the existing pre-deployment backup. No production cleanup
was executed during implementation. Deploying still requires an explicit request.

## Verification

`npm run test:core` includes citation parsing, snapshots, conflicts, visibility and
translation tests. Set `CITATION_TEST_DATABASE_URL` to enable PostgreSQL tests for
stable row identities, unavailable records, atomic failure, Euclid regrouping and
the migration against populated legacy tables. Database tests deliberately accept
only a disposable database at `127.0.0.1:55436`.

For browser tests, use a dedicated local PostgreSQL container on that port, apply
all migrations and seed demo settings. Build and start the application on
`http://127.0.0.1:3210` using that database as `DATABASE_URL` and the test-only
`AUTH_SECRET=mathwoods-citations-local-test-secret-20260905`. Run:

```sh
npm run test:citations:browser
node tests/concept-citations.browser.mjs
node tests/reference-bibliography.browser.mjs
```

The runner also requires `CITATION_TEST_DATABASE_URL` and the same test secret.
It creates isolated verified accounts and fixtures, uses local Chrome, and covers
free entry, search, drafts, save/proposal/approval, hidden citations, export,
history rollback, concurrent edits, optional catalogue proposals, mobile, focus,
search failure and creation preview. Screenshots go under ignored
`runtime/citation-tests`. Destroy the disposable test container after testing.
