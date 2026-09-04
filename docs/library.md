# Math Woods Library

## Temporary admin preview (2026-09-04)

The Library is currently restricted to ADMIN and OWNER accounts. Its navigation, pages, server actions, and exports are protected; it is excluded from the public sitemap and marked noindex. Review notifications go only to admins and the owner during this preview. The broader publication workflow below describes the intended future public release, not current access.

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

A reference is globally unique. Deduplication prefers DOI, then ISBN, then URL, then normalized title, author, and year. A problem or concept links to the reference and stores only contextual information:

- role (`SOURCE`, `FURTHER_READING`, `PROOF`, or `ATTRIBUTION`);
- page, chapter, timestamp, or other locator;
- a short note;
- the primary-source marker for problems.

Reference exports are available as BibTeX and JSON. Custom sources such as a mathematical channel use the same catalogue and may have a pictogram; they do not need to pretend to be a book or article.

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
- Automatic metadata imports from DOI, ISBN, or BibTeX. References are intentionally entered and reviewed manually for now.
