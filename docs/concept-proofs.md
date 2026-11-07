# Optional concept proofs

Concepts can contain up to ten independently titled proofs. An empty list is the
default. Editors add, reorder or remove proofs; the last removal can be undone
before saving. Titles are optional. Empty proof bodies remain editable but do not
produce an empty public disclosure.

Each public proof is a native, initially closed disclosure immediately after the
statement. Its body uses the existing Markdown/LaTeX renderer, images and concept
links. Existing `:::fold Title` blocks can reveal individual steps. Linked
exercises keep their existing behavior.

`Concept.proofs` stores stable local IDs, titles and Markdown in JSON. Proofs belong
to a language version: editing one translation never overwrites another's proofs.
Proof changes participate in review, proposal conflict detection, revision diffs,
rollback, translation freshness, previews, Markdown export and the internal link
index. Concept merges retain distinct proofs and reject capacity overflow rather
than discarding text. Legacy forms and snapshots without the field preserve it;
the latest legacy revision is completed with the current proof baseline before
the first new edit, allowing that edit to be undone.

The editor uses one receipt-protected local draft for the complete ordered list.
Failed submissions retain it. A draft based on different published proofs is
offered for explicit recovery. Individual Markdown editors disable their own
drafts and keep a stable initial value, so typing does not recreate CodeMirror.
Server submission reads the actual textareas to include the final keystroke.

Validation: 160 characters per title, 60,000 per proof body and 120,000 total.
Tests: `tests/concept-proofs.test.mjs`; the optional migration test uses the existing
`MW_PGLITE_MODULE` convention. Apply the `20261107120000_concept_proofs` migration
before running this application version against an existing database.
