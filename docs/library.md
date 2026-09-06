# Math Woods Library

## Temporary admin preview (2026-09-04)

The Library management pages and exports are currently restricted to ADMIN and OWNER accounts; they are excluded from the public sitemap and marked noindex. Verified contributors can search published, searchable references through `/api/references/search` and optionally submit a new reference through `/contributing/references`. These narrow entry points do not open the Library management interface. Review notifications go only to admins and the owner during this preview. The broader publication workflow below describes the intended future public release, not current access.

The Library replaces the separate mathematician and known problem-source interfaces. It keeps three public catalogues under `/library`:

- historical milestones;
- mathematicians;
- references, including books, papers, lecture notes, videos, channels, websites, competitions, and databases.

The production baseline before this work is commit `2cdb58a`. It is considered the known working version. The Library migration is additive: legacy source columns and tables remain in the database during the transition.

## Localization

Canonical identity is stored once. Localized editorial text is stored in translation tables keyed by the entry and language. The reader first receives the requested language, then English, then French, then any available translation.

Reference metadata such as DOI, ISBN, authors, publication year, and canonical title is shared. Only the displayed title and descriptive text are translated.

## Publication workflow

Verified members may create a draft and submit it for review. Drafts stay in their creator's workspace; submitted entries enter the trusted-contributor review queue. A trusted contributor may publish another member's submission or request changes with a written note. Admins and the owner may self-review when necessary. Admins may archive entries, and archived entries remain discoverable from the contribution workspace so they can be restored.

Published entries stay public while trusted contributors edit them. Ordinary members cannot directly alter a published record.

Concurrent edits use the entry's `updatedAt` timestamp. A stale form is rejected instead of silently overwriting a more recent edit. Saving a draft after requested changes retains the review note; resubmitting clears it and notifies reviewers again.

## Discovery and languages

The Library homepage has a cross-catalogue search. Individual catalogues have their own filters and bounded pagination, so their first render does not grow with the whole database. The curated homepage queries full selection lists only for admins editing that selection.

Readers receive the requested translation when it exists. A fallback translation is marked with its language code, including on Library links embedded in problem and concept pages. Editors choose the English or French translation explicitly; opening a missing translation starts with empty localized fields and cannot copy fallback text into the wrong language by accident.

## References

Problem references default to free text with an optional URL. Choosing a catalogue
record is optional. Both kinds share stable citation keys, passages, notes and an
optional per-problem spoiler flag. They participate in local drafts, proposals,
revision history, conflict detection and rollback. Missing citations in a legacy
snapshot mean unknown rather than an empty list. Catalogue metadata propagates
between translations while localized text and divergent passages remain intact.
See [problem citation maintenance and tests](problem-references.md).

A reference is globally unique. Deduplication prefers DOI, then ISBN, then URL, then normalized title, author, and year. A problem or concept links to the reference and stores only contextual information:

- role (`SOURCE`, `FURTHER_READING`, `PROOF`, or `ATTRIBUTION`);
- page, chapter, timestamp, or other locator;
- a short note;
- the primary-source marker for problems.

Reference exports are available as BibTeX and JSON. Custom sources such as a mathematical channel use the same catalogue and may have a pictogram; they do not need to pretend to be a book or article.

## Works, editions and bibliography

The title, type, authors and optional link remain the main form. Edition metadata,
BibTeX/identifiers, custom presentation and pictogram credits are closed sections.
Problem citation details also remain closed after selecting a catalogue reference.

An optional `workId` links a book edition to a general book record. Only published,
searchable, unmerged general books can be selected as new parents. Existing archived
parents are preserved. Transactional validation prevents self-links, nested editions
and concurrent cycles. No existing records are automatically relinked by migration
`20260905210000_reference_editions`; all new fields are nullable.

An internal book of Euclid's Elements (e.g. Book I, proposition 10) is a problem
locator, not a published volume. Separate records are appropriate for identifiable
editions, translations or physically published volumes. Optional fields cover edition,
published volume, translators, editors, journal, issue and article/chapter pages.
Search groups public editions under their work, including matches on edition ISBN or
translator. Editions remain searchable independently if their parent becomes unavailable.

Supplied BibTeX is parsed with `@retorquere/bibtex-parser`, limited to one entry per
record and retained verbatim as the import source. “Import into fields” presents
individual changes; populated fields are unchecked until explicitly selected.
Structured fields determine display and export, including the current citation key.
The original key fills a blank citation key. Syntax errors block saving with an inline message and preserve input;
missing bibliographic metadata produces warnings and does not block a simple reference.
Export generates `book`, `article` or `misc` entries from the
structured fields, escapes plain text and protects title capitalization. Translators
are included in `translator` for BibLaTeX and `note` for classic BibTeX styles.
Exports omit merged/unsearchable records and reject invalid entries, duplicate keys,
missing cross-reference targets and cycles instead of silently
producing a broken file. Missing fields are reported in `.bib` comments. JSON includes
edition metadata and the parent work slug. Work hierarchy is not automatically mapped
to BibTeX `crossref`: an edition is exported with its own bibliographic data.

Additional imported fields survive export. Original TeX spelling is reused when it
still represents the current structured value; changed or cleared fields supersede
the source. String macros are expanded so separately imported records cannot collide.
The admin JSON export includes generated `bibtex` and separate `originalBibtex`.

Migration `20260905230000_concept_citations` marks existing records for a one-time
upgrade. `npm run bibliography:check` previews it; `npm run bibliography:upgrade`
fills missing structured metadata from valid original BibTeX without replacing
populated values. Later intentional blanks stay blank. Malformed originals are
reported by ID for manual review. The deployment script runs both commands after
migrations; the original BibTeX remains stored.

Problem and concept pages expose public, per-page exports in a closed “Export
references” section: `…/export?format=bibtex` and `…/export?format=json`. Only the
page’s citations and required published BibTeX dependencies are exported. JSON v1
separates bibliographic metadata from each page’s text, URL, locator, note and role.
Free citations use `@misc` with a note, without invented titles, authors or years.
Hidden problem citations are filtered using the same access rules as reading the
page; exports are never publicly cached. Unavailable catalogue records fall back to
the saved free citation. The full Library export retains its admin restriction.

Validation: `npm run test:bibliography`; the database case uses only the isolated
`CITATION_TEST_DATABASE_URL` on local port 55436.

## Migration

Migration `20260902170000_add_library`:

1. creates the Library tables without deleting legacy data;
2. publishes and translates existing mathematician records;
3. converts known problem sources and their pictograms into references;
4. converts remaining free-form problem origins into references;
5. converts concept bibliography rows into references;
6. links the migrated records back to their problems and concepts.

The old URLs permanently redirect to their Library equivalents. The old database fields can be removed only in a later migration, after the migrated production data has been inspected.

## Deliberately deferred

- Full revision history for Library entries. Stale-write protection and reviewer attribution exist now, but a later migration should preserve every published revision before the legacy fields are removed.
- Edit proposals against already-published Library entries from ordinary members. For the first release, published records are edited by trusted contributors while all verified members can submit new records.
- Automatic network lookup from DOI or ISBN; pasted BibTeX already supports reviewed import.
